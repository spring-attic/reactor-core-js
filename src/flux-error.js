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

export class OnErrorReturnSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _value: T;
  _done: boolean;
  _requested: number;
  _s: Subscription;

  constructor(actual: Subscriber<T>, value: T) {
    this._actual = actual;
    this._value = value;
    this._requested = 0;
    this._done = false;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T): void {
    const p = this._requested;
    if (p != Infinity) {
      this._requested = p - 1;
    }
    this._actual.onNext(t);
  }

  onError(t: Error): void {
    if (this._requested != 0) {
      this._actual.onNext(this._value);
      this._actual.onComplete();
    } else {
      this._done = true;
    }
  }

  onComplete(): void {
    this._actual.onComplete();
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      if (this._done) {
        if (this._requested == 0) {
          this._requested = 1;
          this._actual.onNext(this._value);
          this._actual.onComplete();
        }
      } else {
        this._requested += n;
        this._s.request(n);
      }
    }
  }

  cancel(): void {
    this._s.cancel();
  }
}

export class OnErrorResumeSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _errorMapper: (t: Error) => Publisher<T>;
  _done: boolean;
  _requested: number;
  _s: ?Subscription;

  constructor(actual: Subscriber<T>, errorMapper: (t: Error) => Publisher<T>) {
    this._actual = actual;
    this._errorMapper = errorMapper;
    this._done = true;
    this._requested = 0;
    this._s = null;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);
    }
  }

  subscribeSecond(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;
    }
  }

  onNext(t: T): void {
    const p = this._requested;
    if (p != Infinity) {
      this._requested = p - 1;
    }
    this._actual.onNext(t);
  }

  onError(t: Error): void {
    let p: Publisher<T>;

    try {
      p = this._errorMapper(t);
    } catch (ex) {
      this._actual.onError(ex);
      return;
    }

    if (p == null) {
      this._actual.onError(
        new Error('The errorMapper returned a null publisher'),
      );
      return;
    }

    if (this._s != SH.CANCELLED) {
      this._s = null;

      p.subscribe(new OnErrorResumeSecondSubscriber(this, this._actual));
    }
  }

  onComplete(): void {
    this._actual.onComplete();
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      if (this._s != null) {
        this._requested += n;
        this._s.request(n);
      }
    }
  }

  cancel(): void {
    if (this._s != null) {
      this._s.cancel();
    }
  }

  currentRequested(): number {
    return this._requested;
  }
}

class OnErrorResumeSecondSubscriber<T> implements Subscriber<T> {
  _parent: OnErrorResumeSubscriber<T>;
  _actual: Subscriber<T>;

  constructor(parent: OnErrorResumeSubscriber<T>, actual: Subscriber<T>) {
    this._parent = parent;
    this._actual = actual;
  }

  onSubscribe(s: Subscription): void {
    this._parent.subscribeSecond(s);
    s.request(this._parent.currentRequested());
  }

  onNext(t: T): void {
    this._actual.onNext(t);
  }

  onError(t: Error): void {
    this._actual.onError(t);
  }

  onComplete(): void {
    this._actual.onComplete();
  }
}
