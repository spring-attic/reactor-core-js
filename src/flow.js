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

import {Subscription, Subscriber, Publisher} from './reactivestreams-spec';

declare class Flux<T> extends Publisher<T> {
  subscribe(s: Subscriber<T>): void;
  subscribe(
    onNext?: (t: T) => void,
    onError?: (t: Error) => void,
    onComplete?: () => void) : Disposable;
}

declare class Mono<T> extends Publisher<T> {
  subscribe(s: Subscriber<T>): void;
  subscribe(
    onNext?: (t: T) => void,
    onError?: (t: Error) => void,
    onComplete?: () => void) : Disposable;
}

export interface Disposable {
  dispose(): void;
}

export class FC {
  static get NONE(): number {
    return 0;
  }
  static get SYNC(): number {
    return 1;
  }
  static get ASYNC(): number {
    return 2;
  }
  static get ANY(): number {
    return 3;
  }
  static get BOUNDARY(): number {
    return 7;
  }

  static unsupported(): Error {
    return new Error('Unsupported in Fusion mode');
  }
}

export interface Fuseable {
  // Javascript has no instanceof, existence of this method is considered to be Fuseable
  isFuseable(): void;
}

export interface Queue<T> {
  offer(t: T): boolean;
  poll(): ?T;
  isEmpty(): boolean;
  clear(): void;
  size(): number;
}

export interface QueueSubscription<T> extends Subscription, Queue<T> {
  requestFusion(mode: number): number;
}

export interface ConditionalSubscriber<T> extends Subscriber<T> {
  tryOnNext(t: T): boolean;
}

export interface Callable<T> {
  call(): ?T;
}

export interface ScalarCallable<T> extends Callable<T> {
  // Javascript has no instanceof, existence of this method is considered to be ScalarCallable
  isScalar(): void;
}

export class CallbackDisposable implements Disposable {
  _callback: ?() => void;

  constructor(callback: () => void) {
    this._callback = callback;
  }

  dispose(): void {
    const c = this._callback;
    if (c != null) {
      this._callback = null;
      c();
    }
  }
}

export class Disposables {
  static _REJECTED = new CallbackDisposable(() => {});
  static get REJECTED(): Disposable {
    return Disposables._REJECTED;
  }
}

export class AlwaysDisposable implements Disposable {
  static _INSTANCE = new AlwaysDisposable();
  static get INSTANCE(): Disposable {
    return AlwaysDisposable._INSTANCE;
  }

  dispose(): void {}
}

export class SimpleDisposable implements Disposable {
  _disposed: boolean;

  dispose(): void {
    this._disposed = true;
  }

  isDisposed(): boolean {
    return this._disposed;
  }
}
