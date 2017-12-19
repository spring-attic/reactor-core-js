/**
 * Copyright (c) 2017-present, Netifi Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
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
import { Cancellation, CancelledCancellation } from './flow';

export class TimedSubscription implements Subscription {
  _actual: Subscriber<number>;

  _future: Cancellation;
  _requested: boolean;

  constructor(actual: Subscriber<number>) {
    this._actual = actual;
    this._requested = false;
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      this._requested = true;
    }
  }

  cancel(): void {
    const a = this._future;
    if (a != CancelledCancellation.INSTANCE) {
      this._future = CancelledCancellation.INSTANCE;
      if (a != null) {
        a.dispose();
      }
    }
  }

  run = (): void => {
    if (this._requested) {
      this._actual.onNext(0);
      if (this._future != CancelledCancellation.INSTANCE) {
        this._actual.onComplete();
      }
    } else {
      this._actual.onError(
        new Error('Could not emit the timed value due to lack of requests'),
      );
    }
  };

  setFuture(c: Cancellation): void {
    const a = this._future;
    if (a != CancelledCancellation.INSTANCE) {
      this._future = c;
    } else {
      c.dispose();
    }
  }
}

export class PeriodicTimedSubscription implements Subscription {
  _actual: Subscriber<number>;

  _future: Cancellation;
  _requested: number;
  _count: number;

  constructor(actual: Subscriber<number>) {
    this._actual = actual;
    this._requested = 0;
    this._count = 0;
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      this._requested += n;
    }
  }

  cancel(): void {
    const a = this._future;
    if (a != CancelledCancellation.INSTANCE) {
      this._future = CancelledCancellation.INSTANCE;
      if (a != null) {
        a.dispose();
      }
    }
  }

  run = (): void => {
    if (this._requested-- > 0) {
      this._actual.onNext(this._count++);
      if (this._future != CancelledCancellation.INSTANCE) {
        this._actual.onComplete();
      }
    } else {
      this.cancel();
      this._actual.onError(
        new Error('Could not emit the timed value due to lack of requests'),
      );
    }
  };

  setFuture(c: Cancellation): void {
    const a = this._future;
    if (a != CancelledCancellation.INSTANCE) {
      this._future = c;
    } else {
      c.dispose();
    }
  }
}

/** Represents a tuple of a value and a time value (timestamp or time interval). */
export class Timed<T> {
  _value: T;
  _time: number;

  get value(): T {
    return this._value;
  }

  get time(): number {
    return this._time;
  }

  constructor(value: T, time: number) {
    this._value = value;
    this._time = time;
  }
}
