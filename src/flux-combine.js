/**
 * Copyright (c) 2016-2018 Pivotal Software Inc, All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @flow
 */

import { Subscription, Subscriber, Publisher } from './reactivestreams-spec';
import { SH, EmptySubscription } from './subscription';
import { SpscLinkedArrayQueue } from './util';

export class WithLatestFrom<T, U, R> implements Subscriber<T>, Subscription {
  _actual: Subscriber<R>;
  _combiner: (t: T, u: U) => R;
  _s: Subscription;
  _otherValue: U;
  _otherSubscriber: WithLatestFromOtherSubscriber<T, U, R>;
  _done: boolean;

  constructor(actual: Subscriber<R>, combiner: (t: T, u: U) => R) {
    this._actual = actual;
    this._combiner = combiner;
    this._otherSubscriber = new WithLatestFromOtherSubscriber(this);
  }

  subscribe(other: Publisher<U>): void {
    other.subscribe(this._otherSubscriber);
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T): void {
    if (this._done) {
      return;
    }

    const v = this._otherValue;

    if (v == null) {
      this._s.request(1);
      return;
    }

    let result;

    try {
      result = this._combiner(t, v);
    } catch (ex) {
      this.cancel();
      this.onError(ex);
      return;
    }

    if (result == null) {
      this.cancel();
      this.onError(new Error('The combiner returned a null value'));
      return;
    }

    this._actual.onNext(result);
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    this._actual.onError(t);
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this._actual.onComplete();
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      this._s.request(n);
    }
  }

  cancelMain(): void {
    const a = this._s;
    if (a != SH.CANCELLED) {
      this._s = SH.CANCELLED;
      if (a != null) {
        a.cancel();
      }
    }
  }

  cancel(): void {
    this.cancelMain();
    this._otherSubscriber.cancel();
  }

  otherNext(t: U): void {
    this._otherValue = t;
  }

  otherError(t: Error): void {
    const a = this._s;
    this.cancelMain();
    if (a == null) {
      this._actual.onSubscribe(EmptySubscription.INSTANCE);
    }
    this.onError(t);
  }

  otherComplete(): void {
    if (this._otherValue == null) {
      const a = this._s;
      this.cancelMain();
      if (a == null) {
        this._actual.onSubscribe(EmptySubscription.INSTANCE);
      }
      this._actual.onComplete();
    }
  }
}

class WithLatestFromOtherSubscriber<T, U, R> implements Subscriber<U> {
  _parent: WithLatestFrom<T, U, R>;
  _s: Subscription;

  constructor(parent: WithLatestFrom<T, U, R>) {
    this._parent = parent;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;
      s.request(Infinity);
    }
  }

  onNext(t: U): void {
    this._parent.otherNext(t);
  }

  onError(t: Error): void {
    this._parent.otherError(t);
  }

  onComplete(): void {
    this._parent.otherComplete();
  }

  cancel(): void {
    const a = this._s;
    if (a != SH.CANCELLED) {
      this._s = SH.CANCELLED;
      if (a != null) {
        a.cancel();
      }
    }
  }
}

export class CombineLatest<R> implements Subscription {
  _actual: Subscriber<R>;
  _combiner: (a: any[]) => R;
  _subscribers: CombineLatestInnerSubscriber<R>[];
  _cancelled: boolean;
  _requested: number;
  _queue: SpscLinkedArrayQueue<any>;
  _wip: number;
  _latest: any[];
  _active: number;
  _completed: number;
  _error: ?Error;

  constructor(
    actual: Subscriber<R>,
    combiner: (a: any[]) => R,
    prefetch: number,
    n: number,
  ) {
    this._actual = actual;
    this._combiner = combiner;
    const a: Array<CombineLatestInnerSubscriber<R>> = new Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = new CombineLatestInnerSubscriber(this, i, prefetch);
    }
    this._subscribers = a;
    this._cancelled = false;
    this._requested = 0;
    this._active = 0;
    this._completed = 0;
    this._error = null;
    this._wip = 0;
    this._queue = new SpscLinkedArrayQueue(prefetch);
    const b = new Array(n);
    b.fill(null);
    this._latest = b;
  }

  subscribe(sources: Publisher<any>[], n: number) {
    const a = this._subscribers;
    for (let i = 0; i < n; i++) {
      if (this._cancelled) {
        break;
      }
      sources[i].subscribe(a[i]);
    }
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      this._requested += n;
      this.drain();
    }
  }

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true;
      for (const inner of this._subscribers) {
        inner.cancel();
      }
    }
  }

  innerNext(index: number, t: any): void {
    const c = this._latest;

    let a = this._active;
    if (c[index] == null) {
      a++;
      this._active = a;
    }
    c[index] = t;

    if (a == c.length) {
      this._queue.offer(index);
      this._queue.offer(c.slice());
      this.drain();
    } else {
      this._subscribers[index].requestOne();
    }
  }

  innerError(index: number, t: Error): void {
    if (this.addError(t)) {
      this.drain();
    } else {
      console.log(t);
    }
  }

  innerComplete(index: number): void {
    const a = this._latest;
    const n = a.length;
    if (a[index] == null) {
      this._completed = n;
      this.drain();
      return;
    }
    if (this._completed < n) {
      if (++this._completed == n) {
        this.drain();
      }
    }
  }

  addError(t: Error): boolean {
    const e = this._error;
    if (e != SH.TERMINAL_ERROR) {
      if (e == null) {
        this._error = t;
      } else {
        this._error = new Error(e.message + '\n' + t.message);
      }
      return true;
    }
    return false;
  }

  drain(): void {
    if (this._wip++ != 0) {
      return;
    }

    let missed = 1;
    const q = this._queue;
    const a = this._actual;
    const subscribers = this._subscribers;
    const n = subscribers.length;
    const f = this._combiner;

    for (;;) {
      const r = this._requested;
      let e = 0;

      while (e != r) {
        if (this._cancelled) {
          q.clear();
          return;
        }

        const ex = this._error;
        if (ex != null) {
          this._error = SH.TERMINAL_ERROR;
          this.cancel();
          q.clear();
          a.onError(ex);
          return;
        }

        const index = q.poll();

        const empty = index == null;

        if (this._completed == n && empty) {
          a.onComplete();
          return;
        }

        if (empty) {
          break;
        }

        const array = (q.poll(): Array<any>);

        let v;

        try {
          v = f(array);
        } catch (ex2) {
          this.cancel();
          this.addError(ex2);
          continue;
        }

        if (v == null) {
          this.cancel();
          this.addError(
            new Error('The combiner function returned a null value'),
          );
          continue;
        }

        a.onNext(v);

        e++;
        subscribers[(index: number)].requestOne();
      }

      if (e == r) {
        if (this._cancelled) {
          q.clear();
          return;
        }

        const ex = this._error;
        if (ex != null) {
          this._error = SH.TERMINAL_ERROR;
          this.cancel();
          q.clear();
          a.onError(ex);
          return;
        }

        if (this._completed == n && q.isEmpty()) {
          a.onComplete();
          return;
        }
      }

      missed = this._wip - missed;
      this._wip = missed;
      if (missed == 0) {
        break;
      }
    }
  }
}

class CombineLatestInnerSubscriber<R> implements Subscriber<any> {
  _parent: CombineLatest<R>;
  _index: number;
  _prefetch: number;
  _s: Subscription;
  _produced: number;
  _limit: number;

  constructor(parent: CombineLatest<R>, index: number, prefetch: number) {
    this._parent = parent;
    this._index = index;
    this._prefetch = prefetch;
    this._produced = 0;
    this._limit = prefetch - (prefetch >> 2);
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      s.request(this._prefetch);
    }
  }

  onNext(t: any): void {
    this._parent.innerNext(this._index, t);
  }

  onError(t: Error): void {
    if (this._s != SH.CANCELLED) {
      this._s = SH.CANCELLED;
      this._parent.innerError(this._index, t);
    }
  }

  onComplete(): void {
    if (this._s != SH.CANCELLED) {
      this._s = SH.CANCELLED;
      this._parent.innerComplete(this._index);
    }
  }

  cancel(): void {
    const a = this._s;
    if (a != SH.CANCELLED) {
      this._s = SH.CANCELLED;
      if (a != null) {
        a.cancel();
      }
    }
  }

  requestOne(): void {
    const p = this._produced + 1;
    if (p == this._limit) {
      this._produced = 0;
      this._s.request(p);
    } else {
      this._produced = p;
    }
  }
}
