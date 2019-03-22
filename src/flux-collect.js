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
import { SH, DeferrendScalarSubscription } from './subscription';

export class CollectSubscriber<T, U> extends DeferrendScalarSubscription<U>
  implements Subscriber<T>, Subscription {
  _collection: U;
  _collector: (U, T) => void;
  _s: Subscription;
  _done: boolean;

  constructor(actual: Subscriber<U>, collection: U, collector: (U, T) => void) {
    super(actual);
    this._collection = collection;
    this._collector = collector;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this.actual.onSubscribe(this);

      s.request(Infinity);
    }
  }

  onNext(t: T): void {
    if (this._done) {
      return;
    }
    try {
      this._collector(this._collection, t);
    } catch (ex) {
      this._s.cancel();
      this.onError(ex);
      return;
    }
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    this.actual.onError(t);
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    super.complete(this._collection);
  }

  request(n: number): void {
    super.request(n);
  }

  cancel(): void {
    super.cancel();
    this._s.cancel();
  }
}

export class ReduceSubscriber<T, U> extends DeferrendScalarSubscription<U>
  implements Subscriber<T>, Subscription {
  _accumulator: U;
  _reducer: (U, T) => U;
  _s: Subscription;
  _done: boolean;

  constructor(actual: Subscriber<U>, accumulator: U, reducer: (U, T) => U) {
    super(actual);
    this._accumulator = accumulator;
    this._reducer = reducer;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;
      this.actual.onSubscribe(this);

      s.request(Infinity);
    }
  }

  onNext(t: T): void {
    if (this._done) {
      return;
    }

    let u;
    try {
      u = this._reducer(this._accumulator, t);
    } catch (ex) {
      this._s.cancel();
      this.onError(ex);
      return;
    }

    if (u == null) {
      this._s.cancel();
      this.onError(new Error('The reducer returned a null value'));
      return;
    }
    this._accumulator = u;
  }

  onError(t: Error): void {
    if (this._done) {
      console.log(t);
      return;
    }
    this._done = true;
    this.actual.onError(t);
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    super.complete(this._accumulator);
  }

  request(n: number): void {
    super.request(n);
  }

  cancel(): void {
    super.cancel();
    this._s.cancel();
  }
}
