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
import { SH } from './subscription';
import { SpscArrayQueue } from './util';

export class SwitchMapSubscriber<T, R> implements Subscriber<T>, Subscription {
  _actual: Subscriber<R>;
  _mapper: (t: T) => Publisher<R>;
  _prefetch: number;

  _requested: number = 0;
  _wip: number = 0;
  _error: ?Error = null;
  _done: boolean = false;
  _s: Subscription;
  _index: number = 0;
  _current: ?SwitchMapInnerSubscriber<T, R> = null;
  _cancelled: boolean = false;

  constructor(
    actual: Subscriber<R>,
    mapper: (t: T) => Publisher<R>,
    prefetch: number,
  ) {
    this._actual = actual;
    this._mapper = mapper;
    this._prefetch = prefetch;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);

      s.request(Infinity);
    }
  }

  onNext(t: T): void {
    if (this._done) {
      return;
    }
    const idx = ++this._index;
    const c = this._current;
    if (c != null) {
      c.cancel();
    }

    const p = this._mapper(t);

    if (p == null) {
      this.onError(new Error('The mapper returned a null Publisher'));
      return;
    }

    const inner = new SwitchMapInnerSubscriber(this, this._prefetch, idx);
  }

  addError(t: Error): boolean {
    const ex = this._error;
    if (ex != SH.TERMINAL_ERROR) {
      if (ex == null) {
        this._error = t;
      } else {
        this._error = new Error(ex.message + '\n' + t.message);
      }
      return true;
    }
    return false;
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    if (this.addError(t)) {
      this.drain();
    } else {
      console.log(t);
    }
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this.drain();
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
      this._s.cancel();
      const inner = this._current;
      if (inner != null) {
        inner.cancel();
      }
      if (this._wip++ == 0) {
        this._current = null;
      }
    }
  }

  drain(): void {
    if (this._wip++ != 0) {
      return;
    }

    const a = this._actual;

    let missing = 1;

    outer: for (;;) {
      const c = this._current;
      if (c != null) {
        const r = this._requested;
        let e = 0;

        while (e != r) {
          if (this._cancelled) {
            this._current = null;
            return;
          }
          const ex = this._error;
          if (ex != null) {
            this.cancel();
            this._error = SH.TERMINAL_ERROR;
            a.onError(ex);
            return;
          }

          if (c._index != this._index) {
            this._requested -= e;
            continue outer;
          }

          const v = c._queue.poll();

          if (c._done && v == null && this._done) {
            this._current = null;
            a.onComplete();
            return;
          }

          if (v == null) {
            break;
          }

          a.onNext(v);

          e++;
        }

        if (e == r) {
          if (this._cancelled) {
            this._current = null;
            return;
          }

          const ex = this._error;
          if (ex != null) {
            this.cancel();
            this._error = SH.TERMINAL_ERROR;
            a.onError(ex);
            return;
          }

          if (c._index != this._index) {
            this._requested -= e;
            continue outer;
          }

          if (this._done && c._done && c._queue.isEmpty()) {
            this._current = null;
            a.onComplete();
            return;
          }
        }

        if (e != 0) {
          this._requested -= e;
          c.request(e);
        }
      } else {
        const ex = this._error;
        if (ex != null) {
          this.cancel();
          this._error = SH.TERMINAL_ERROR;
          a.onError(ex);
          return;
        }
        if (this._done) {
          a.onComplete();
          return;
        }
      }

      missing = this._wip - missing;
      this._wip = missing;
      if (missing == 0) {
        break;
      }
    }
  }
}

class SwitchMapInnerSubscriber<T, R> implements Subscriber<R> {
  _parent: SwitchMapSubscriber<T, R>;
  _prefetch: number;
  _index: number;

  _s: Subscription;
  _queue: SpscArrayQueue<R>;
  _produced: number = 0;
  _limit: number;
  _done: boolean = false;

  constructor(
    parent: SwitchMapSubscriber<T, R>,
    prefetch: number,
    index: number,
  ) {
    this._parent = parent;
    this._prefetch = prefetch;
    this._index = index;
    this._queue = new SpscArrayQueue(prefetch);
    this._limit = prefetch - (prefetch >> 2);
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      s.request(this._prefetch);
    }
  }

  onNext(t: R): void {
    if (!this._queue.offer(t)) {
      this.onError(new Error('SwitchMap inner queue full?!'));
      return;
    }
    this._parent.drain();
  }

  onError(t: Error): void {
    if (this._parent.addError(t)) {
      this._done = true;
      this._parent.drain();
    } else {
      console.log(t);
    }
  }

  onComplete(): void {
    this._done = true;
    this._parent.drain();
  }

  request(n: number): void {
    const p = this._produced + n;
    if (p >= this._limit) {
      this._produced = 0;
      this._s.request(p);
    } else {
      this._produced = p;
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
}
