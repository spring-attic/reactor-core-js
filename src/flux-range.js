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

import { Subscriber } from './reactivestreams-spec';
import { FC, QueueSubscription } from './flow';
import { SH } from './subscription';

export class FluxRangeSubscription implements QueueSubscription<number> {
  _actual: Subscriber<number>;
  _end: number;
  _requested: number;
  _index: number;
  _cancelled: boolean;

  constructor(start: number, end: number, actual: Subscriber<number>) {
    this._actual = actual;
    this._index = start;
    this._end = end;
    this._requested = 0;
    this._cancelled = false;
  }

  request(n: number): void {
    if (n <= 0) {
      throw new Error('n > 0 required but it was ' + n);
    }
    let r = this._requested;
    this._requested = r + n;

    if (r == 0) {
      const f = this._end;
      const a = this._actual;
      let i = this._index;

      if (n >= f - i) {
        for (; i != f; i++) {
          if (this._cancelled) {
            return;
          }
          a.onNext(i);
        }
        if (!this._cancelled) {
          a.onComplete();
        }
        return;
      }
      r = n;
      let e = 0;

      for (;;) {
        if (this._cancelled) {
          return;
        }

        while (e != r && i != f) {
          a.onNext(i);

          if (this._cancelled) {
            return;
          }

          i++;
          e++;
        }

        if (this._cancelled) {
          return;
        }

        if (i == f) {
          a.onComplete();
          return;
        }

        n = this._requested;
        if (r == n) {
          this._requested = 0;
          return;
        } else {
          r = n;
        }
      }
    }
  }

  cancel(): void {
    this._cancelled = true;
  }

  requestFusion(mode: number): number {
    if ((mode & FC.SYNC) != 0) {
      return FC.SYNC;
    }
    return FC.NONE;
  }

  offer(t: number): boolean {
    throw FC.unsupported();
  }

  poll(): ?number {
    const index = this._index;
    if (index == this._end) {
      return null;
    }
    this._index = index + 1;
    return index;
  }

  isEmpty(): boolean {
    return this._index == this._end;
  }

  size(): number {
    return this._end - this._index;
  }

  clear() {
    this._index = this._end;
  }
}

export class FluxArraySubscription<T> implements QueueSubscription<T> {
  _actual: Subscriber<T>;
  _array: Array<T>;
  _index: number;
  _requested: number;
  _cancelled: boolean;

  constructor(array: Array<T>, actual: Subscriber<T>) {
    this._actual = actual;
    this._array = array;
    this._index = 0;
    this._requested = 0;
    this._cancelled = false;
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      let r = this._requested;
      this._requested = r + n;
      if (r != 0) {
        return;
      }

      r = n;
      let e = 0;
      let i = this._index;
      const b = this._array;
      const f = b.length;
      const a = this._actual;

      for (;;) {
        if (this._cancelled) {
          return;
        }

        while (e != r && i != f) {
          const v = b[i];

          if (v == null) {
            a.onError(new Error('The ' + i + 'th element was null'));
            return;
          }

          a.onNext(v);

          if (this._cancelled) {
            return;
          }

          i++;
          e++;
        }

        if (this._cancelled) {
          return;
        }

        if (i == f) {
          a.onComplete();
          return;
        }

        n = this._requested;
        if (r == n) {
          this._requested = 0;
          return;
        } else {
          r = n;
        }
      }
    }
  }

  cancel(): void {
    this._cancelled = true;
  }

  requestFusion(mode: number): number {
    if ((mode & FC.SYNC) != 0) {
      return FC.SYNC;
    }
    return FC.NONE;
  }

  offer(t: T): boolean {
    throw FC.unsupported();
  }

  poll(): ?T {
    const i = this._index;
    const b = this._array;
    if (i == b.length) {
      return null;
    }
    this._index = i + 1;
    const v = b[i];
    if (v == null) {
      throw new Error('The ' + i + 'th element was null');
    }
    return v;
  }

  isEmpty(): boolean {
    return this._array.length == this._index;
  }

  size(): number {
    return this._array.length - this._index;
  }

  clear() {
    this._index = this._array.length;
  }
}
