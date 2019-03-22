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
import { TimedWorker, TimedScheduler } from './scheduler';
import { Disposable } from './flow';

export class DebounceTimedSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _timeout: number;
  _worker: TimedWorker;
  _timer: ?Disposable = null;
  _s: Subscription;
  _requested: number = 0;
  _done: boolean = false;

  constructor(actual: Subscriber<T>, timeout: number, worker: TimedWorker) {
    this._actual = actual;
    this._timeout = timeout;
    this._worker = worker;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);

      s.request(Infinity);
    }
  }

  onNext(t: T): void {
    const at = this._timer;
    if (at != null) {
      at.dispose();
    }

    this._timer = this._worker.scheduleDelayed(() => {
      const r = this._requested;
      if (r != 0) {
        this._actual.onNext(t);
        if (r != Infinity) {
          this._requested--;
        }
        if (this._done) {
          this._actual.onComplete();
          this._worker.shutdown();
        }
      } else {
        this.cancel();
        this._actual.onError(
          new Error('Could not emit value due to lack of requests'),
        );
      }
      this._timer = null;
    }, this._timeout);
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._worker.shutdown();
    this._actual.onError(t);
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    const at = this._timer;
    if (at == null) {
      this._actual.onComplete();
      this._worker.shutdown();
    }
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      this._requested += n;
    }
  }

  cancel(): void {
    this._s.cancel();
    this._worker.shutdown();
  }
}

export class SampleTimedSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _delay: number;
  _scheduler: TimedScheduler;
  _s: Subscription;
  _timer: Disposable;
  _value: ?T = null;
  _requested: number = 0;

  constructor(actual: Subscriber<T>, delay: number, scheduler: TimedScheduler) {
    this._actual = actual;
    this._delay = delay;
    this._scheduler = scheduler;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._timer = this._scheduler.schedulePeriodic(
        () => this.take(),
        this._delay,
        this._delay,
      );

      this._actual.onSubscribe(this);

      s.request(Infinity);
    }
  }

  take(): void {
    const v = this._value;
    if (v != null) {
      this._value = null;
      if (this._requested != 0) {
        this._actual.onNext((v: T));
        if (this._requested != Infinity) {
          this._requested--;
        }
      } else {
        this.cancel();
        this._actual.onError(
          new Error('Could not emit value due to lack of requests'),
        );
      }
    }
  }

  onNext(t: T): void {
    this._value = t;
  }

  onError(t: Error): void {
    this._timer.dispose();
    this._actual.onError(t);
  }

  onComplete(): void {
    this._timer.dispose();
    const v = this._value;
    if (v != null) {
      this._actual.onNext((v: T));
    }
    this._actual.onComplete();
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      this._requested += n;
    }
  }

  cancel(): void {
    this._s.cancel();
    this._timer.dispose();
  }
}

export class ThrottleFirstTimedSubscriber<T>
  implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _timeout: number;
  _worker: TimedWorker;
  _s: Subscription;
  _value: ?T = null;
  _timer: ?Disposable = null;

  constructor(actual: Subscriber<T>, timeout: number, worker: TimedWorker) {
    this._actual = actual;
    this._timeout = timeout;
    this._worker = worker;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T): void {
    const v = this._value;
    if (v != null) {
      this._s.request(1);
    } else {
      this._value = t;
      this._actual.onNext(t);
      this._timer = this._worker.scheduleDelayed(() => {
        this._value = null;
        this._timer = null;
      }, this._timeout);
    }
  }

  onError(t: Error): void {
    const at = this._timer;
    if (at != null) {
      at.dispose();
    }
    this._actual.onError(t);
  }

  onComplete(): void {
    const at = this._timer;
    if (at != null) {
      at.dispose();
    }
    this._actual.onComplete();
  }

  request(n: number): void {
    this._s.request(n);
  }

  cancel(): void {
    const at = this._timer;
    if (at != null) {
      at.dispose();
    }
    this._s.cancel();
  }
}
