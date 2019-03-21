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

export class ZipCoordinator<T, R> implements Subscription {
  _actual: Subscriber<R>;
  _zipper: (t: T[]) => R;
  _prefetch: number;
  _n: number;

  _subscribers: ZipInnerSubscriber<T, R>[];
  _requested: number;
  _wip: number;
  _cancelled: boolean;
  _error: Error;
  _row: Array<?T>;

  constructor(
    actual: Subscriber<R>,
    zipper: (t: T[]) => R,
    prefetch: number,
    n: number,
  ) {
    this._actual = actual;
    this._zipper = zipper;
    this._prefetch = prefetch;
    this._n = n;
    this._requested = 0;
    this._wip = 0;
    const a = new Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = new ZipInnerSubscriber(this, prefetch, i);
    }
    this._subscribers = a;

    this._row = new Array(n).fill(null);
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

      if (this._wip++ == 0) {
        this.clearAll();
      }
    }
  }

  clearAll(): void {
    for (const inner of this._subscribers) {
      inner.cancel();
      inner.clear();
    }
  }

  subscribe(sources: Publisher<T>[], n: number) {
    const a = this._subscribers;
    for (let i = 0; i < n; i++) {
      if (this._cancelled) {
        break;
      }
      sources[i].subscribe(a[i]);
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

  innerError(inner: number, t: Error): void {
    if (this.addError(t)) {
      this._subscribers[inner].setDone();
      this.drain();
    } else {
      console.log(t);
    }
  }

  drain(): void {
    if (this._wip++ != 0) {
      return;
    }
    let missed = 1;
    const a = this._actual;
    const sa = this._subscribers;
    const n = sa.length;
    const row = this._row;

    for (;;) {
      const r = this._requested;
      let e = 0;

      outer: while (e != r) {
        if (this._cancelled) {
          this.clearAll();
          return;
        }

        const ex = this._error;
        if (ex != null) {
          this._error = SH.TERMINAL_ERROR;
          this.clearAll();
          a.onError(ex);
          return;
        }

        let empty = false;

        for (let i = 0; i < n; i++) {
          if (row[i] == null) {
            let v;

            try {
              v = sa[i].poll();
            } catch (t) {
              this.addError(t);
              continue outer;
            }

            empty = v == null;

            if (sa[i].isDone() && empty) {
              this.clearAll();

              a.onComplete();

              return;
            }

            if (v == null) {
              break;
            }

            row[i] = v;
          }
        }

        if (empty) {
          break;
        }

        let result: R;

        try {
          result = this._zipper(((row.slice(): any): T[]));
        } catch (t) {
          this.addError(t);
          continue outer;
        }

        if (result == null) {
          this.addError(new Error('The zipper returned a null value'));
          continue outer;
        }

        a.onNext(result);

        e++;
        row.fill(null);
      }

      if (e == r) {
        if (this._cancelled) {
          this.clearAll();
          return;
        }

        const ex = this._error;
        if (ex != null) {
          this._error = SH.TERMINAL_ERROR;
          this.clearAll();
          a.onError(ex);
          return;
        }

        for (let i = 0; i < n; i++) {
          if (row[i] == null) {
            let v;

            try {
              v = sa[i].poll();
            } catch (t) {
              this.addError(t);
              const ex0 = this._error;
              if (ex0 != null) {
                this._error = SH.TERMINAL_ERROR;
                this.clearAll();
                a.onError(ex0);
                return;
              }
            }

            if (sa[i].isDone() && v == null) {
              this.clearAll();

              a.onComplete();

              return;
            }

            if (v == null) {
              break;
            }

            row[i] = v;
          }
        }
      }

      if (e != 0) {
        if (r != Infinity) {
          this._requested -= e;
        }

        for (const s of sa) {
          s.consumed(e);
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

class ZipInnerSubscriber<T, R> implements Subscriber<T> {
  _parent: ZipCoordinator<T, R>;
  _prefetch: number;
  _index: number;

  _s: Subscription;
  _produced: number;
  _limit: number;
  _queue: Queue<T>;
  _done: boolean;

  constructor(parent: ZipCoordinator<T, R>, prefetch: number, index: number) {
    this._parent = parent;
    this._prefetch = prefetch;
    this._index = index;
    this._produced = 0;
    this._limit = prefetch - (prefetch >> 2);
    this._queue = new SpscArrayQueue(prefetch);
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;
      s.request(this._prefetch);
    }
  }

  onNext(t: T): void {
    if (!this._queue.offer(t)) {
      this.onError(new Error('Zip queue full?!'));
      return;
    }
    this._parent.drain();
  }

  onError(t: Error): void {
    this._parent.innerError(this._index, t);
  }

  onComplete(): void {
    this._done = true;
    this._parent.drain();
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

  consumed(n: number) {
    const p = this._produced + n;
    if (p >= this._limit) {
      this._produced = 0;
      this._s.request(p);
    } else {
      this._produced = p;
    }
  }

  clear(): void {
    this._queue.clear();
  }

  poll(): ?T {
    return this._queue.poll();
  }

  setDone(): void {
    this._done = true;
  }

  isDone(): boolean {
    return this._done;
  }
}
