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
}
