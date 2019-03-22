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

import { FC, Queue, Callable } from './flow';
import { Subscription, Subscriber, Publisher } from './reactivestreams-spec';
import { SH } from './subscription';
import { SpscArrayQueue, SpscLinkedArrayQueue } from './util';

export class FlatMapSubscriber<T, R> implements Subscriber<T>, Subscription {
  _actual: Subscriber<R>;
  _mapper: (t: T) => Publisher<R>;
  _delayError: boolean;
  _maxConcurrency: number;
  _prefetch: number;

  _wip: number;
  _requested: number;

  _cancelled: boolean;
  _done: boolean;
  _error: ?Error;

  _s: Subscription;

  _scalarQueue: ?Queue<R>;

  _scalarEmission: number;
  _scalarLimit: number;

  _subscribers: Array<?FlatMapInnerSubscriber<T, R>>;
  _freelist: Array<number>;
  _producerIndex: number;
  _consumerIndex: number;

  _index: number;

  constructor(
    actual: Subscriber<R>,
    mapper: (t: T) => Publisher<R>,
    delayError: boolean,
    maxConcurrency: number,
    prefetch: number,
  ) {
    this._actual = actual;
    this._mapper = mapper;
    this._delayError = delayError;
    this._maxConcurrency = maxConcurrency;
    this._prefetch = prefetch;
    this._wip = 0;
    this._requested = 0;
    this._done = false;
    this._error = null;
    this._scalarQueue = null;
    this._scalarEmission = 0;
    this._index = 0;
    if (maxConcurrency == Infinity) {
      this._scalarLimit = Infinity;
    } else {
      this._scalarLimit = maxConcurrency - (maxConcurrency >> 2);
    }
    this._subscribers = [];
    this._freelist = [];
    this._producerIndex = 0;
    this._consumerIndex = 0;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);

      if (this._maxConcurrency == Infinity) {
        s.request(Infinity);
      } else {
        s.request(this._maxConcurrency);
      }
    }
  }

  onNext(t: T): void {
    let p: Publisher<R>;

    try {
      p = this._mapper(t);
    } catch (ex) {
      this._s.cancel();
      this.onError(ex);
      return;
    }

    if (p == null) {
      this._s.cancel();
      this.onError(new Error('The mapper returned a null Publisher'));
      return;
    }

    const c: Callable<R> = (p: any);

    if (c.call) {
      this.scalarNext(c.call());
    } else {
      const inner: FlatMapInnerSubscriber<T, R> = new FlatMapInnerSubscriber(
        this,
        this._prefetch,
      );
      this.addInner(inner);

      p.subscribe(inner);
    }
  }

  addInner(inner: FlatMapInnerSubscriber<T, R>) {
    //this.subscribepush(inner);
    const i = this.pollIndex();
    this._subscribers[i] = inner;
  }

  pollIndex(): number {
    const b = this._freelist;
    const ci = this._consumerIndex;
    const m = b.length - 1;

    if (ci == this._producerIndex) {
      const n = m < 0 ? 1 : (m + 1) * 2;
      b.length = n;
      for (let i = m + 1; i < n; i++) {
        b[i] = i;
      }
      this._consumerIndex = ci + 1;
      this._producerIndex = n - 1;
      return m + 1;
    } else {
      const o = ci & m;
      const idx = b[o];
      this._consumerIndex = ci + 1;
      return idx;
    }
  }

  removeInner(index: number) {
    //this.subscribesplice(index, 1);
    this._subscribers[index] = null;
    this.offerIndex(index);
  }

  offerIndex(index: number): void {
    const b = this._freelist;
    const pi = this._producerIndex;
    const m = b.length - 1;
    const o = pi & m;
    b[o] = index;
    this._producerIndex = pi + 1;
  }

  scalarProduced(): void {
    const p = this._scalarEmission + 1;
    if (p == this._scalarLimit) {
      this._scalarEmission = 0;
      this._s.request(p);
    } else {
      this._scalarEmission = p;
    }
  }

  scalarNext(t: ?R): void {
    if (t == null) {
      this.scalarProduced();
      return;
    }

    if (this._wip == 0) {
      this._wip = 1;

      if (this._requested != 0) {
        this._actual.onNext(t);

        if (this._requested != Infinity) {
          this._requested--;
        }

        this.scalarProduced();
      } else {
        const q = this.getOrCreateScalarQueue();

        if (!q.offer(t)) {
          this._s.cancel();
          this.onError(new Error('Scalar queue is full?!'));
          this.drainLoop();
          return;
        }
      }

      if (--this._wip == 0) {
        return;
      }
      this.drainLoop();
    } else {
      const q = this.getOrCreateScalarQueue();

      if (!q.offer(t)) {
        this._s.cancel();
        this.onError(new Error('Scalar queue is full?!'));
        this.drainLoop();
        return;
      }

      this._wip++;
    }
  }

  getOrCreateScalarQueue(): Queue<R> {
    let q: Queue<R>;
    if (this._scalarQueue != null) {
      q = this._scalarQueue;
    } else {
      if (this._maxConcurrency == Infinity) {
        q = new SpscLinkedArrayQueue(this._prefetch);
      } else {
        q = new SpscArrayQueue(this._maxConcurrency);
      }
      this._scalarQueue = q;
    }
    return q;
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    if (this.addError(t)) {
      this._done = true;
      this.drain();
    } else {
      console.log(t);
    }
  }

  onComplete(): void {
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
    this._cancelled = true;
    this._s.cancel();

    if (this._wip++ == 0) {
      this.cleanup();
    }
  }

  addError(t: Error) {
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

  innerError(inner: FlatMapInnerSubscriber<T, R>, t: Error) {
    if (this.addError(t)) {
      inner._done = true;
      this.drain();
    } else {
      console.log(t);
    }
  }

  innerNext(inner: FlatMapInnerSubscriber<T, R>, t: R) {
    if (this._wip == 0) {
      this._wip = 1;

      if (this._requested != 0) {
        this._actual.onNext(t);
        if (this._requested != Infinity) {
          this._requested--;
        }

        inner.request(1);
      } else {
        const q = inner.getOrCreateQueue();
        if (!q.offer(t)) {
          inner.cancel();
          this.innerError(inner, new Error('Inner queue full?!'));
          this.drainLoop();
          return;
        }
      }

      if (--this._wip == 0) {
        return;
      }
      this.drainLoop();
    } else {
      const q = inner.getOrCreateQueue();
      if (!q.offer(t)) {
        inner.cancel();
        this.innerError(inner, new Error('Inner queue full?!'));
        this.drainLoop();
        return;
      }
      this._wip++;
    }
  }

  drain() {
    if (this._wip++ == 0) {
      this.drainLoop();
    }
  }

  drainLoop() {
    let missed = this._wip;

    const b = this._subscribers;
    const a = this._actual;

    for (;;) {
      let sq = this._scalarQueue;
      let requestMain = 0;

      const r = this._requested;
      let e = 0;

      if (sq != null) {
        while (e != r) {
          const v = sq.poll();

          if (this.checkTerminated(this._done, v == null && b.length == 0)) {
            return;
          }

          if (v == null) {
            break;
          }

          a.onNext(v);

          e++;
          this.scalarProduced();
        }
      }

      if (b.length != 0 && e != r) {
        let i = this._index;

        if (i >= b.length) {
          i = 0;
        }

        for (let j = 0; j < b.length; j++) {
          if (this._cancelled) {
            this.cleanup();
            return;
          }

          if (!this._delayError && this._error != null) {
            const ex = this._error;
            this._error = SH.TERMINAL_ERROR;
            this._s.cancel();
            this.cleanup();
            a.onError(ex);
            return;
          }

          const inner = b[i];
          if (inner != null) {
            const q = inner._queue;
            if (q == null || q.isEmpty()) {
              if (inner._done) {
                this.removeInner(i);
                //i--;
                requestMain++;
              }
            } else {
              while (e != r) {
                if (this._cancelled) {
                  this.cleanup();
                  return;
                }

                if (!this._delayError && this._error != null) {
                  const ex = this._error;
                  this._s.cancel();
                  this.cleanup();
                  a.onError(ex);
                  return;
                }

                let v;

                try {
                  v = q.poll();
                } catch (t) {
                  this.addError(t);

                  if (!this._delayError) {
                    this._s.cancel();
                    this.cleanup();
                    const ex = this._error;
                    this._error = SH.TERMINAL_ERROR;
                    if (ex != null) {
                      a.onError(ex);
                    }
                    return;
                  } else {
                    inner.cancel();
                  }

                  this.removeInner(i);
                  //i--;
                  requestMain++;
                  break;
                }

                if (inner._done && v == null) {
                  this.removeInner(i);
                  //i--;
                  requestMain++;
                  break;
                }

                if (v == null) {
                  break;
                }

                a.onNext(v);

                e++;
                inner.request(1);
              }

              if (e == r) {
                if (this._cancelled) {
                  this.cleanup();
                  return;
                }

                if (inner._done && q.isEmpty()) {
                  this.removeInner(i);
                  //i--;
                  requestMain++;
                }
                break;
              }
            }
          }

          if (++i >= b.length) {
            i = 0;
          }
        }
        this._index = i;
      }

      sq = this._scalarQueue;
      if (
        this.checkTerminated(
          this._done,
          (sq == null || sq.isEmpty()) && b.length == 0,
        )
      ) {
        return;
      }

      if (e != 0 && this._requested != Infinity) {
        this._requested -= e;
      }

      if (!this._done && requestMain != 0 && this._maxConcurrency != Infinity) {
        this._s.request(requestMain);
        continue;
      }

      const m = this._wip - missed;
      if (m == 0) {
        this._wip = 0;
        break;
      }
      missed = m;
    }
  }

  cleanup() {
    this._scalarQueue = null;
    for (const inner of this._subscribers) {
      if (inner != null) {
        inner.cancel();
      }
    }
    this._subscribers.length = 0;
  }

  checkTerminated(d: boolean, empty: boolean): boolean {
    if (this._cancelled) {
      this.cleanup();
      return true;
    }

    if (this._delayError) {
      if (d && empty) {
        const ex = this._error;
        this._error = SH.TERMINAL_ERROR;
        if (ex != null) {
          this._actual.onError(ex);
        } else {
          this._actual.onComplete();
        }
        return true;
      }
    } else {
      if (d) {
        const ex = this._error;
        if (ex != null) {
          this._error = SH.TERMINAL_ERROR;
          this._s.cancel();
          this.cleanup();
          this._actual.onError(ex);
          return true;
        } else if (empty) {
          this._actual.onComplete();
          return true;
        }
      }
    }

    return false;
  }
}

export class FlatMapInnerSubscriber<T, R> implements Subscriber<R> {
  _parent: FlatMapSubscriber<T, R>;
  _prefetch: number;
  _queue: ?Queue<R>;
  _s: Subscription;
  _produced: number;
  _limit: number;
  _done: boolean;
  _sourceMode: number;

  constructor(parent: FlatMapSubscriber<T, R>, prefetch: number) {
    this._parent = parent;
    this._prefetch = prefetch;
    this._queue = null;
    this._produced = 0;
    this._done = false;
    this._limit = prefetch - (prefetch >> 2);
    this._sourceMode = 0;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      /* fusion seems to add significant overhead

            const qs = s as QueueSubscription<R>;

            if (qs.requestFusion) {
                const mode = qs.requestFusion(FC.ANY);

                if (mode == FC.SYNC) {
                    this.sourceMode = mode;
                    this.queue = qs;
                    this.done = true;

                    this.mParent.drain();
                    return;
                } else
                if (mode == FC.ASYNC) {
                    this.sourceMode = mode;
                    this.queue = qs;

                    s.request(this.mPrefetch);

                    return;
                }
            }
            */

      s.request(this._prefetch);
    }
  }

  onNext(t: R): void {
    if (this._sourceMode == FC.ASYNC) {
      this._parent.drain();
    } else {
      this._parent.innerNext(this, t);
    }
  }

  onError(t: Error): void {
    this._parent.innerError(this, t);
  }

  onComplete(): void {
    this._done = true;
    this._parent.drain();
  }

  request(n: number): void {
    if (this._sourceMode != FC.SYNC) {
      const p = this._produced + n;
      if (p >= this._limit) {
        this._produced = 0;
        this._s.request(p);
      } else {
        this._produced = p;
      }
    }
  }

  getOrCreateQueue(): Queue<R> {
    let q: Queue<R>;
    if (this._queue != null) {
      q = this._queue;
    } else {
      q = new SpscArrayQueue(this._prefetch);
      this._queue = q;
    }
    return q;
  }

  cancel(): void {
    this._s.cancel();
  }
}
