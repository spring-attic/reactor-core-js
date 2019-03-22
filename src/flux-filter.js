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
import { ConditionalSubscriber } from './flow';

export class FluxFilterSubscriber<T>
  implements ConditionalSubscriber<T>, Subscription {
  _actual: Subscriber<T>;
  _predicate: (t: T) => boolean;
  _s: Subscription;
  _done: boolean;

  constructor(actual: Subscriber<T>, predicate: (t: T) => boolean) {
    this._actual = actual;
    this._predicate = predicate;
  }

  onSubscribe(s: Subscription) {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T) {
    if (!this.tryOnNext(t)) {
      this._s.request(1);
    }
  }

  tryOnNext(t: T): boolean {
    if (this._done) {
      return true;
    }

    let v;
    try {
      v = this._predicate(t);
    } catch (ex) {
      this._s.cancel();
      this.onError(ex);
      return true;
    }

    if (v) {
      this._actual.onNext(t);
      return true;
    }
    return false;
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
