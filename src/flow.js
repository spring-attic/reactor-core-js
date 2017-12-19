/**
 * Copyright (c) 2017-present, Netifi Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
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

export interface Cancellation {
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

export class CallbackCancellation implements Cancellation {
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

export class Cancellations {
  static REJECTED_INSTANCE = new CallbackCancellation(() => {});
  static get REJECTED(): Cancellation {
    return Cancellations.REJECTED_INSTANCE;
  }
}

export class CancelledCancellation implements Cancellation {
  static INSTANCE_0 = new CancelledCancellation();
  static get INSTANCE(): Cancellation {
    return CancelledCancellation.INSTANCE_0;
  }

  dispose(): void {}
}

export class BooleanCancellation implements Cancellation {
  _cancelled: boolean;

  dispose(): void {
    this._cancelled = true;
  }

  isCancelled(): boolean {
    return this._cancelled;
  }
}
