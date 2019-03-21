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

export class FluxMapSubscriber<T, R> implements Subscriber<T>, Subscription {
  _actual: Subscriber<R>;
  _mapper: (t: T) => R;

  _s: Subscription;
  _done: boolean;

  constructor(actual: Subscriber<R>, mapper: (t: T) => R) {
    this._actual = actual;
    this._mapper = mapper;
  }

  onSubscribe(s: Subscription) {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T) {
    if (this._done) {
      return;
    }

    let v;
    try {
      v = this._mapper(t);
    } catch (ex) {
      this._s.cancel();
      this.onError(ex);
      return;
    }

    this._actual.onNext(v);
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

  request(n: number) {
    this._s.request(n);
  }

  cancel() {
    this._s.cancel();
  }
}

export class FluxHideSubscriber<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;

  _s: Subscription;

  constructor(actual: Subscriber<T>) {
    this._actual = actual;
  }

  onSubscribe(s: Subscription) {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T) {
    this._actual.onNext(t);
  }

  onError(t: Error) {
    this._actual.onError(t);
  }

  onComplete() {
    this._actual.onComplete();
  }

  request(n: number) {
    this._s.request(n);
  }

  cancel() {
    this._s.cancel();
  }
}
