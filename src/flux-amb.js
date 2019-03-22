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

import { Subscription, Subscriber, Publisher } from './reactivestreams-spec';
import { SH } from './subscription';

export class AmbCoordinator<T> implements Subscription {
  _subscribers: Array<AmbSubscriber<T>>;
  _winner: number = -1;
  _cancelled: boolean = false;

  constructor(actual: Subscriber<T>, n: number) {
    const a: Array<AmbSubscriber<T>> = new Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = new AmbSubscriber(actual, i, this);
    }
    this._subscribers = a;
  }

  subscribe(sources: Array<Publisher<T>>, n: number): void {
    for (let i = 0; i < n; i++) {
      if (this._winner >= 0 || this._cancelled) {
        break;
      }
      sources[i].subscribe(this._subscribers[i]);
    }
  }

  request(n: number): void {
    if (this._winner < 0) {
      for (const inner of this._subscribers) {
        inner.request(n);
      }
    } else {
      this._subscribers[n].request(n);
    }
  }

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true;
      for (const inner of this._subscribers) {
        inner.cancel();
      }
    }
  }

  tryWinning(index: number): boolean {
    if (this._winner >= 0) {
      return false;
    }
    this._winner = index;

    const a = this._subscribers;
    for (let i = 0; i < a.length; i++) {
      if (i !== index) {
        a[i].cancel();
      }
    }
    return true;
  }
}

class AmbSubscriber<T> implements Subscriber<T> {
  _actual: Subscriber<T>;
  _index: number;
  _parent: AmbCoordinator<T>;
  _winner: boolean = false;
  _s: Subscription;
  _requested: number = 0;

  constructor(actual: Subscriber<T>, index: number, parent: AmbCoordinator<T>) {
    this._actual = actual;
    this._index = index;
    this._parent = parent;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;
      const r = this._requested;
      this._requested = 0;
      if (r != 0) {
        s.request(r);
      }
    }
  }

  onNext(t: T): void {
    if (this._winner) {
      this._actual.onNext(t);
    } else {
      if (this._parent.tryWinning(this._index)) {
        this._winner = true;
        this._actual.onNext(t);
      }
    }
  }

  onError(t: Error): void {
    if (this._winner) {
      this._actual.onError(t);
    } else {
      if (this._parent.tryWinning(this._index)) {
        this._winner = true;
        this._actual.onError(t);
      } else {
        console.log(t);
      }
    }
  }

  onComplete(): void {
    if (this._winner) {
      this._actual.onComplete();
    } else {
      if (this._parent.tryWinning(this._index)) {
        this._winner = true;
        this._actual.onComplete();
      }
    }
  }

  request(n: number): void {
    if (SH.validRequest(n)) {
      const us = this._s;
      if (us == null) {
        this._requested += n;
      } else {
        us.request(n);
      }
    }
  }

  cancel(): void {
    const a = this._s;
    if (a != SH.CANCELLED) {
      this._s = SH.CANCELLED;
      if (a != null) {
        a.cancel();
      }
    }
  }
}
