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

import {Publisher, Subscriber} from "./reactivestreams-spec";
import {CallbackSubscriber} from "./subscriber";
import {Fuseable} from "./flow";
import {DeferrendScalarSubscription} from "./subscription";

/** Base class and fluent API entry point for 0..1 element publishers. */
export class Mono<T> implements Publisher<T> {
  subscribe(subscriberOrNext?: Subscriber<T> | (t: T) => void,
            onError?: (t: Error) => void,
            onComplete?: () => void): any {
    if (subscriberOrNext == null || typeof subscriberOrNext === 'function') {
      const cs = new CallbackSubscriber(
        subscriberOrNext == null ? (t: T): void => {} : subscriberOrNext,
        onError == null ? (t: Error): void => {} : onError,
        onComplete == null ? (): void => {} : onComplete,
      );
      this._subscribe(cs);
      return cs;
    } else {
      this._subscribe(subscriberOrNext);
    }
  }

  _subscribe(s: Subscriber<T>): void {
    throw new Error('subscribe method not implemented!');
  }

  static fromPromise(source: Promise<T>): Mono<T> {
    return new MonoPromise(source);
  }
}

class MonoPromise<T> extends Mono<T> implements Fuseable {
  _promise: Promise<T>;

  constructor(promise: Promise<T>) {
    super();
    this._promise = promise;
  }

  _subscribe(actual: Subscriber<T>): void {
    let s = new DeferrendScalarSubscription(actual);
    actual.onSubscribe(s);
    if (s.isCancelled()) {
      return;
    }
    this._promise.then(v => {
      if (v != null) {
        s.complete(v);
      } else {
        actual.onComplete();
      }
    }, e => {
      actual.onError(e);
    });
  }

  isFuseable(): void {}
}
