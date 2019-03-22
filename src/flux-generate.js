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
import { SH } from './subscription';

export class GenerateSubscription<T, S> implements Subscription, Subscriber<T> {
  _actual: Subscriber<T>;
  _state: S;
  _generator: (state: S, out: Subscriber<T>) => S;
  _stateDisposer: (state: S) => void;

  _requested: number = 0;
  _cancelled: boolean = false;
  _done: boolean = false;
  _hasValue: boolean = false;

  constructor(
    actual: Subscriber<T>,
    state: S,
    generator: (state: S, out: Subscriber<T>) => S,
    stateDisposer: (state: S) => void,
  ) {
    this._actual = actual;
    this._state = state;
    this._generator = generator;
    this._stateDisposer = stateDisposer;
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      const r = this._requested;
      this._requested = r + n;
      if (r == 0) {
        this.drain(n);
      }
    }
  }

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true;
      if (this._requested++ == 0) {
        this.clear();
      }
    }
  }

  clear(): void {
    try {
      this._stateDisposer(this._state);
    } catch (ex) {
      console.log(ex);
    }
  }

  drain(r: number): void {
    let state: S = this._state;

    for (;;) {
      let e = 0;

      while (e != r) {
        if (this._cancelled) {
          this.clear();
          return;
        }

        this._hasValue = false;

        state = this._generator(state, this);

        if (this._done) {
          this.clear();
          return;
        }

        e++;
      }

      if (e == r) {
        if (this._cancelled) {
          this.clear();
          return;
        }
      }

      if (e != 0) {
        r = this._requested - e;
        this._requested = r;
        if (r == 0) {
          this._state = state;
          break;
        }
      }
    }
  }

  onSubscribe(s: Subscription): void {
    // NO op
  }

  onNext(t: T): void {
    if (this._hasValue) {
      this.onError(new Error('More than one value has been generated'));
    } else {
      this._hasValue = true;
      this._actual.onNext(t);
    }
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
}
