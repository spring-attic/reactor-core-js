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

/** Represents an active connection between a Subscriber and a Publisher. */
export interface Subscription {
  request(n: number): void;
  cancel(): void;
}

/** Represents the consumer of signals. */
export interface Subscriber<T> {
  onSubscribe(s: Subscription): void;
  onNext(t: T): void;
  onError(t: Error): void;
  onComplete(): void;
}

/** Represents the originator/emitter of signals. */
export interface Publisher<T> {
  subscribe(s: Subscriber<T>): void; // no idea how to express ? super T
}

/** Represents a Subscriber and Publisher at the same time. */
export interface Processor<T, R> extends Subscriber<T>, Publisher<R> {}
