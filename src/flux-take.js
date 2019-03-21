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

import { Subscription, Subscriber } from './reactivestreams-spec';
import {
  SH,
  EmptySubscription,
  DeferrendScalarSubscription,
} from './subscription';
import { RingBuffer } from './util';

export class FluxTakeSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _remaining: number;
  _once: boolean;
  _s: Subscription;
  _done: boolean;

  constructor(n: number, actual: Subscriber<T>) {
    this._actual = actual;
    this._remaining = n;
    this._once = false;
    this._done = false;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;
      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T) {
    if (this._done) {
      return;
    }

    let r = this._remaining;

    if (r == 0) {
      this._done = true;
      this._s.cancel();
      this._actual.onComplete();
      return;
    }
    this._remaining = --r;

    this._actual.onNext(t);

    if (r == 0 && !this._done) {
      this._done = true;
      this._s.cancel();
      this._actual.onComplete();
      return;
    }
  }

  onError(t: Error) {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    this._actual.onError(t);
  }

  onComplete() {
    if (this._done) {
      return;
    }
    this._done = true;
    this._actual.onComplete();
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      if (!this._once) {
        this._once = true;
        if (n >= this._remaining) {
          this._s.request(Infinity);
          return;
        }
      }
      this._s.request(n);
    }
  }

  cancel() {
    this._s.cancel();
  }
}

export class FluxSkipSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _s: Subscription;
  _remaining: number;

  constructor(actual: Subscriber<T>, n: number) {
    this._actual = actual;
    this._remaining = n;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;
      const n = this._remaining;
      this._actual.onSubscribe(this);
      s.request(n);
    }
  }

  onNext(t: T): void {
    let r = this._remaining;
    if (r != 0) {
      r--;
      this._remaining = r;
      if (r != 0) {
        return;
      }
    }
    this._actual.onNext(t);
  }

  onError(t: Error): void {
    this._actual.onError(t);
  }

  onComplete(): void {
    this._actual.onComplete();
  }

  request(n: number) {
    this._s.request(n);
  }

  cancel(): void {
    this._s.cancel();
  }
}

export class TakeLastSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;

  _s: Subscription;
  _requested: number = 0;
  _done: boolean = false;
  _queue: RingBuffer<T>;
  _cancelled: boolean = false;

  constructor(actual: Subscriber<T>, n: number) {
    this._actual = actual;
    this._queue = new RingBuffer(n);
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);

      s.request(Infinity);
    }
  }

  onNext(t: T): void {
    this._queue.offer(t);
  }

  onError(t: Error): void {
    this._queue.clear();
    this._actual.onError(t);
  }

  onComplete(): void {
    this._done = true;
    const r = this._requested;
    if (r != 0) {
      this.drain(r);
    }
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      const r = this._requested;
      this._requested = r + n;
      if (this._done && r == 0) {
        this.drain(n);
      }
    }
  }

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true;
      this._queue.clear();
    }
  }

  drain(r: number): void {
    const q = this._queue;
    const a = this._actual;
    for (;;) {
      let e = 0;
      while (e != r) {
        if (this._cancelled) {
          return;
        }
        const v = q.poll();
        if (v == null) {
          a.onComplete();
          return;
        }
        a.onNext(v);

        e++;
      }

      if (r == e) {
        if (this._cancelled) {
          return;
        }
        if (q.isEmpty()) {
          a.onComplete();
          return;
        }
      }

      if (r != Infinity) {
        r = this._requested - e;
        this._requested = r;
        if (r == 0) {
          break;
        }
      }
    }
  }
}

export class TakeLastOneSubscriber<T> extends DeferrendScalarSubscription<T>
  implements Subscriber<T> {
  _s: Subscription;

  _value: T;

  constructor(actual: Subscriber<T>) {
    super(actual);
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this.actual.onSubscribe(this);

      s.request(Infinity);
    }
  }

  onNext(t: T): void {
    this._value = t;
  }

  onError(t: Error): void {
    this.actual.onError(t);
  }

  onComplete(): void {
    const v = this._value;
    if (v != null) {
      this.complete(v);
    } else {
      this.actual.onComplete();
    }
  }

  cancel(): void {
    super.cancel();
    this._s.cancel();
  }
}

export class SkipLastSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _n: number;

  _s: Subscription;
  _queue: RingBuffer<T>;

  constructor(actual: Subscriber<T>, n: number) {
    this._actual = actual;
    this._n = n;
    this._queue = new RingBuffer(n);
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);

      s.request(this._n);
    }
  }

  onNext(t: T): void {
    const q = this._queue;

    if (q.isFull()) {
      const v = q.poll();
      if (v != null) {
        this.onNext(v);
      }
    }
    q.offer(t);
  }

  onError(t: Error): void {
    this._actual.onError(t);
  }

  onComplete(): void {
    this._actual.onComplete();
  }

  request(n: number): void {
    this._s.request(n);
  }

  cancel(): void {
    this._s.cancel();
  }
}

export class TakeUntilMainSubscriber<T, U>
  implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;

  _s: Subscription;
  _other: TakeUntilOtherSubscriber<T, U>;
  _done: boolean = false;

  constructor(actual: Subscriber<T>) {
    this._actual = actual;
    this._other = new TakeUntilOtherSubscriber(this);
  }

  getOther(): Subscriber<U> {
    return this._other;
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
    this._actual.onNext(t);
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    this._other.cancel();
    this._actual.onError(t);
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this._other.cancel();
    this._actual.onComplete();
  }

  request(n: number): void {
    this._s.request(n);
  }

  cancel(): void {
    this._s.cancel();
    this._other.cancel();
  }

  otherSignal(): void {
    this._done = true;
    if (this._s == null) {
      this._s = SH.CANCELLED;
      EmptySubscription.complete(this._actual);
    } else {
      this._s.cancel();
      this._s = SH.CANCELLED;
      this._actual.onComplete();
    }
  }

  otherError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    if (this._s == null) {
      this._s = SH.CANCELLED;
      EmptySubscription.error(this._actual, t);
    } else {
      this._s.cancel();
      this._s = SH.CANCELLED;
      this._actual.onError(t);
    }
  }
}

class TakeUntilOtherSubscriber<T, U> implements Subscriber<U> {
  _main: TakeUntilMainSubscriber<T, U>;

  _s: Subscription;
  _done: boolean = false;

  constructor(main: TakeUntilMainSubscriber<T, U>) {
    this._main = main;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      s.request(Infinity);
    }
  }

  onNext(t: U): void {
    if (this._done) {
      return;
    }
    this._s.cancel();
    this.onComplete();
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    this._main.otherError(t);
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this._main.otherSignal();
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

export class SkipUntilMainSubscriber<T, U>
  implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;

  _s: Subscription;
  _other: SkipUntilOtherSubscriber<T, U>;
  _gate: boolean = false;
  _done: boolean = false;

  constructor(actual: Subscriber<T>) {
    this._actual = actual;
    this._other = new SkipUntilOtherSubscriber(this);
  }

  getOther(): Subscriber<U> {
    return this._other;
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
    if (this._gate) {
      this._actual.onNext(t);
    } else {
      this._s.request(1);
    }
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    this._other.cancel();
    this._actual.onError(t);
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this._other.cancel();
    this._actual.onComplete();
  }

  request(n: number): void {
    this._s.request(n);
  }

  cancel(): void {
    this._s.cancel();
    this._other.cancel();
  }

  otherSignal(): void {
    this._gate = true;
  }

  otherError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    if (this._s == null) {
      this._s = SH.CANCELLED;
      EmptySubscription.error(this._actual, t);
    } else {
      this._s.cancel();
      this._s = SH.CANCELLED;
      this._actual.onError(t);
    }
  }
}

class SkipUntilOtherSubscriber<T, U> implements Subscriber<U> {
  _main: SkipUntilMainSubscriber<T, U>;

  _s: Subscription;
  _done: boolean = false;

  constructor(main: SkipUntilMainSubscriber<T, U>) {
    this._main = main;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      s.request(Infinity);
    }
  }

  onNext(t: U): void {
    if (this._done) {
      return;
    }
    this._s.cancel();
    this.onComplete();
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    this._main.otherError(t);
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this._main.otherSignal();
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
