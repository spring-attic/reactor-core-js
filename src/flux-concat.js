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
import { Queue } from './flow';
import { SpscArrayQueue } from './util';

export class ConcatMapSubscriber<T, R> implements Subscriber<T>, Subscription {
  _actual: Subscriber<R>;
  _mapper: (t: T) => Publisher<R>;
  _delayError: boolean;
  _prefetch: number;
  _queue: Queue<T>;
  _s: Subscription;
  _active: boolean;
  _done: boolean;
  _error: ?Error;
  _inner: ConcatMapInnerSubscriber<T, R>;
  _cancelled: boolean;
  _wip: number;
  _consumed: number;
  _limit: number;

  constructor(
    actual: Subscriber<R>,
    mapper: (t: T) => Publisher<R>,
    delayError: boolean,
    prefetch: number,
  ) {
    this._actual = actual;
    this._mapper = mapper;
    this._delayError = delayError;
    this._prefetch = prefetch;
    this._queue = new SpscArrayQueue(prefetch);
    this._active = false;
    this._done = false;
    this._error = null;
    this._cancelled = false;
    this._wip = 0;
    this._consumed = 0;
    this._limit = prefetch - (prefetch >> 2);
    this._inner = new ConcatMapInnerSubscriber(this, actual);
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);

      s.request(this._prefetch);
    }
  }

  onNext(t: T): void {
    if (!this._queue.offer(t)) {
      this.onError(new Error('ConcatMap queue is full?!'));
      return;
    }
    this.drain();
  }

  onError(t: Error): void {
    if (this._done && !this.addError(t)) {
      console.log(t);
      return;
    }
    this._done = true;
    this.drain();
  }

  onComplete(): void {
    this._done = true;
    this.drain();
  }

  request(n: number): void {
    this._inner.request(n);
  }

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true;
      this._s.cancel();
      this._inner.cancel();
    }
  }

  innerError(t: Error): void {
    if (this.addError(t)) {
      this._active = false;
      this.drain();
    } else {
      console.log(t);
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

  innerComplete(): void {
    this._active = false;
    this.drain();
  }

  drain(): void {
    if (this._wip++ != 0) {
      return;
    }

    for (;;) {
      if (this._cancelled) {
        this._queue.clear();
        return;
      }
      const err = this._error;
      if (err != null && !this._delayError) {
        this.cancel();
        this._queue.clear();
        this._error = SH.TERMINAL_ERROR;
        this._actual.onError(err);
        return;
      }

      if (!this._active) {
        const v = this._queue.poll();

        if (this._done && v == null) {
          const ex = this._error;
          if (ex != null) {
            this._error = SH.TERMINAL_ERROR;
            this._actual.onError(ex);
          } else {
            this._actual.onComplete();
          }
          return;
        }

        if (v != null) {
          const c = this._consumed + 1;
          if (c == this._limit) {
            this._consumed = 0;
            this._s.request(c);
          } else {
            this._consumed = c;
          }

          let p: Publisher<R>;

          try {
            p = this._mapper(v);
          } catch (e) {
            this.addError(e);
            continue;
          }

          if (p == null) {
            this.addError(new Error('The mapper returned a null Publisher'));
            continue;
          }

          /*
                    const call = (p as Object) as Callable<R>;

                    if (call.call) {
                        var u;

                        try {
                            u = call.call();
                        } catch (e) {
                            this.addError(e);
                            continue;
                        }

                        if (u == null) {
                            continue;
                        }

                        if (this.inner.hasRequested()) {
                            this.actual.onNext(u);
                            this.inner.produceOne();
                            continue;
                        }
                    }
                    */
          this._active = true;
          p.subscribe(this._inner);
        }
      }

      if (--this._wip == 0) {
        break;
      }
    }
  }
}

class ConcatMapInnerSubscriber<T, R> implements Subscriber<R> {
  _parent: ConcatMapSubscriber<T, R>;
  _actual: Subscriber<R>;
  _s: Subscription;
  _requested: number;
  _produced: number;

  constructor(parent: ConcatMapSubscriber<T, R>, actual: Subscriber<R>) {
    this._parent = parent;
    this._actual = actual;
    this._requested = 0;
    this._produced = 0;
  }

  onSubscribe(s: Subscription): void {
    const a = this._s;
    if (a == SH.CANCELLED) {
      s.cancel();
    } else {
      this._s = s;
      s.request(this._requested);
    }
  }

  onNext(t: R): void {
    this._produced++;
    this._actual.onNext(t);
  }

  onError(t: Error): void {
    this.applyProduced();
    this._parent.innerError(t);
  }

  onComplete(): void {
    this.applyProduced();
    this._parent.innerComplete();
  }

  applyProduced(): void {
    const r = this._requested;
    if (r != Infinity) {
      this._requested = r - this._produced;
    }
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      this._requested += n;
      const a = this._s;
      if (a != null) {
        a.request(n);
      }
    }
  }

  cancel(): void {
    const a = this._s;
    if (a != SH.CANCELLED) {
      this._s = SH.CANCELLED;
      if (a != null && a != SH.CANCELLED) {
        a.cancel();
      }
    }
  }

  hasRequested(): boolean {
    return this._requested != 0;
  }

  produceOne(): void {
    const r = this._requested;
    if (r != Infinity) {
      this._requested = r - 1;
    }
  }
}
