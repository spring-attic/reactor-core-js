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
import { FC, QueueSubscription } from './flow';

/** Class representing a cancelled subscription that ignores Subscription calls. */
class CancelledSubscription implements Subscription {
  request(n: number): void {
    // deliberately ignored
  }

  cancel(): void {
    // deliberately ignored
  }
}

/** A subscription that does not react to any Subscription calls and appears to be empty. */
export class EmptySubscription implements QueueSubscription<any> {
  request(n: number): void {
    // deliberately ignored
  }

  cancel(): void {
    // deliberately ignored
  }

  requestFusion(mode: number): number {
    return FC.NONE;
  }

  offer(t: any): boolean {
    throw new Error('Unsupported in Fusion mode');
  }

  poll(): any {
    return null;
  }

  isEmpty(): boolean {
    return true;
  }

  size(): number {
    return 0;
  }

  clear(): void {
    // no op
  }

  /** Set the singleton empty instance on the target subscriber and complete it. */
  static complete(s: Subscriber<any>): void {
    s.onSubscribe(EmptySubscription.INSTANCE);
    s.onComplete();
  }

  /** Set the singleton empty instance on the target and call onError on it. */
  static error(s: Subscriber<any>, e: Error): void {
    s.onSubscribe(EmptySubscription.INSTANCE);
    s.onError(e);
  }

  static EMPTY_INSTANCE = new EmptySubscription();

  /** Returns the singleton instance of this class. */
  static get INSTANCE(): Subscription {
    return EmptySubscription.EMPTY_INSTANCE;
  }
}

/** Emits a constant value once there is a request for it. */
export class ScalarSubscription<T> implements QueueSubscription<T> {
  _actual: Subscriber<T>;
  _value: T;
  _once: boolean;

  constructor(value: T, actual: Subscriber<T>) {
    this._value = value;
    this._actual = actual;
  }

  request(n: number) {
    if (SH.validRequest(n)) {
      if (!this._once) {
        this._once = true;

        this._actual.onNext(this._value);
        this._actual.onComplete();
      }
    }
  }

  cancel() {
    this._once = true;
  }

  offer(t: T): boolean {
    throw FC.unsupported();
  }

  poll(): ?T {
    if (!this._once) {
      this._once = true;
      return this._value;
    }
    return null;
  }

  isEmpty(): boolean {
    return this._once;
  }

  clear() {
    this._once = true;
  }

  size(): number {
    return this._once ? 0 : 1;
  }

  requestFusion(mode: number): number {
    if ((mode & FC.SYNC) != 0) {
      return FC.SYNC;
    }
    return FC.NONE;
  }
}

/*eslint-disable */
const DeferredState = {
  NO_REQUEST_NO_VALUE: 0,
  HAS_REQUEST_NO_VALUE: 1,
  NO_REQUEST_HAS_VALUE: 2,
  HAS_REQUEST_HAS_VALUE: 3,
  CANCELLED: 4,
};
/*eslint-enable */

type DeferredStateEnum = $Values<typeof DeferredState>;

/*eslint-disable */
const FusedState = {
  NOT_FUSED: 0,
  NO_VALUE: 1,
  HAS_VALUE: 2,
  COMPLETE: 3,
};
/*eslint-enable */

type FusedStateEnum = $Values<typeof FusedState>;

/** A fuseable Subscription that holds a single value and emits it when there is request for it. */
export class DeferrendScalarSubscription<T> implements QueueSubscription<T> {
  actual: Subscriber<T>;
  _value: T;
  _state: DeferredStateEnum;
  _fused: FusedStateEnum;

  constructor(actual: Subscriber<T>) {
    this.actual = actual;
    this._state = DeferredState.NO_REQUEST_NO_VALUE;
    this._fused = FusedState.NOT_FUSED;
  }

  complete(t: T) {
    if (this._fused === FusedState.NO_VALUE) {
      this._value = t;
      this._fused = FusedState.HAS_VALUE;

      this.actual.onNext(t);
      this.actual.onComplete();
    } else {
      const s = this._state;
      if (s === DeferredState.HAS_REQUEST_NO_VALUE) {
        this._state = DeferredState.HAS_REQUEST_HAS_VALUE;

        this.actual.onNext(t);
        if (this._state !== DeferredState.CANCELLED) {
          this.actual.onComplete();
        }
      } else if (s === DeferredState.NO_REQUEST_NO_VALUE) {
        this._value = t;
        this._state = DeferredState.NO_REQUEST_HAS_VALUE;
      }
    }
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      const s = this._state;
      if (s === DeferredState.NO_REQUEST_HAS_VALUE) {
        this._state = DeferredState.HAS_REQUEST_HAS_VALUE;

        this.actual.onNext(this._value);
        if (this._state !== DeferredState.CANCELLED) {
          this.actual.onComplete();
        }
      } else if (s === DeferredState.NO_REQUEST_NO_VALUE) {
        this._state = DeferredState.HAS_REQUEST_NO_VALUE;
      }
    }
  }

  cancel(): void {
    this._state = DeferredState.CANCELLED;
    this._fused = FusedState.COMPLETE;
  }

  requestFusion(mode: number): number {
    if ((mode & FC.ASYNC) !== 0 && (mode & FC.BOUNDARY) === 0) {
      this._fused = FusedState.NO_VALUE;
      return FC.ASYNC;
    }
    return FC.NONE;
  }

  offer(t: T): boolean {
    throw FC.unsupported();
  }

  poll(): ?T {
    if (this._fused === FusedState.HAS_VALUE) {
      this._fused = FusedState.COMPLETE;
      return this._value;
    }
    return null;
  }

  isEmpty(): boolean {
    return this._fused !== FusedState.HAS_VALUE;
  }

  size(): number {
    return this.isEmpty() ? 0 : 1;
  }

  clear(): void {
    this._fused = FusedState.COMPLETE;
  }
}

/** Suppresses the fusion capability of an upstream source. */
export class SuppressFusionSubscriber<T>
  implements Subscriber<T>, QueueSubscription<T> {
  _actual: Subscriber<T>;
  _s: Subscription;

  constructor(actual: Subscriber<T>) {
    this._actual = actual;
  }

  onSubscribe(s: Subscription) {
    this._s = s;
    this._actual.onSubscribe(this);
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

  requestFusion(mode: number): number {
    return FC.NONE;
  }

  offer(t: T): boolean {
    throw FC.unsupported();
  }

  poll(): ?T {
    return null;
  }

  isEmpty(): boolean {
    return true;
  }

  size(): number {
    return 0;
  }

  clear(): void {
    // deliberately no op
  }
}

/** Utility methods to validate requests and Subscription status. */
export class SH {
  /** Verify that the number is positive. */
  static validRequest(n: number): boolean {
    if (n <= 0) {
      throw new Error('n > 0 required but it was ' + n);
    }
    return true;
  }

  /** Verify that the current Subscription is null and the new Subscription is not null, otherwise
   * cancel the incoming subscription and throw an error. */
  static validSubscription(current: ?Subscription, s: Subscription): boolean {
    if (s == null) {
      throw new Error('s is null');
    }
    if (current != null) {
      s.cancel();
      if (current != SH.CANCELLED) {
        throw new Error('Subscription already set!');
      }
      return false;
    }
    return true;
  }

  static CANCELLED_INSTANCE = new CancelledSubscription();

  /** The standard cancelled Subscription instance. */
  static get CANCELLED(): Subscription {
    return SH.CANCELLED_INSTANCE;
  }

  static TERMINAL_ERROR_INSTANCE = new Error('Terminated');

  /** The standard exception indicating no more exception can be accumulated. */
  static get TERMINAL_ERROR(): Error {
    return SH.TERMINAL_ERROR_INSTANCE;
  }
}
