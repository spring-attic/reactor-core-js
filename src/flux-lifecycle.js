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
import { SH, EmptySubscription } from './subscription';

export class DoOnLifecycle<T> implements Subscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _onSubscribe: (s: Subscription) => void;
  _onNext: (t: T) => void;
  _onAfterNext: (t: T) => void;
  _onError: (t: Error) => void;
  _onComplete: () => void;
  _onAfterTerminate: () => void;
  _onRequest: (n: number) => void;
  _onCancel: () => void;

  _s: Subscription;
  _done: boolean;

  constructor(
    actual: Subscriber<T>,
    onSubscribe: (s: Subscription) => void,
    onNext: (t: T) => void,
    onAfterNext: (t: T) => void,
    onError: (t: Error) => void,
    onComplete: () => void,
    onAfterTerminate: () => void,
    onRequest: (n: number) => void,
    onCancel: () => void,
  ) {
    this._actual = actual;
    this._onSubscribe = onSubscribe;
    this._onNext = onNext;
    this._onAfterNext = onAfterNext;
    this._onError = onError;
    this._onComplete = onComplete;
    this._onAfterTerminate = onAfterTerminate;
    this._onRequest = onRequest;
    this._onCancel = onCancel;
    this._done = false;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      try {
        this._onSubscribe(s);
      } catch (ex) {
        this._done = true;
        s.cancel();
        EmptySubscription.error(this._actual, ex);
        return;
      }

      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T): void {
    if (this._done) {
      return;
    }
    try {
      this._onNext(t);
    } catch (ex) {
      this.cancel();
      this.onError(ex);
      return;
    }

    this._actual.onNext(t);

    try {
      this._onAfterNext(t);
    } catch (ex) {
      this.cancel();
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

    try {
      this._onError(t);
    } catch (ex) {
      t = new Error(t.message + '\n' + ex.message);
    }

    this._actual.onError(t);

    try {
      this._onAfterTerminate();
    } catch (ex) {
      console.log(ex);
    }
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;

    let c = false;
    try {
      this._onComplete();
      c = true;
    } catch (ex) {
      this._actual.onError(ex);
    }

    if (c) {
      this.onComplete();
    }

    try {
      this._onAfterTerminate();
    } catch (ex) {
      console.log(ex);
    }
  }

  request(n: number): void {
    try {
      this._onRequest(n);
    } catch (ex) {
      console.log(ex);
    }
    this._s.request(n);
  }

  cancel(): void {
    try {
      this._onCancel();
    } catch (ex) {
      console.log(ex);
    }
    this._s.cancel();
  }
}
