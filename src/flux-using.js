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
import { SH, EmptySubscription } from './subscription';

export class UsingSubscriber<T, R> implements Subscriber<T>, Subscription {
  static subscribe<T, R>(
    actual: Subscriber<T>,
    resourceFactory: () => R,
    publisherFactory: (resource: R) => Publisher<T>,
    resourceDisposer: (resource: R) => void,
    eager: boolean,
  ): void {
    let resource;

    try {
      resource = resourceFactory();
    } catch (ex) {
      EmptySubscription.error(actual, ex);
      return;
    }

    let p;

    try {
      p = publisherFactory(resource);
    } catch (ex) {
      try {
        resourceDisposer(resource);
      } catch (ex2) {
        ex = new Error(ex.message + '\n' + ex2.message);
      }
      EmptySubscription.error(actual, ex);
      return;
    }

    if (p == null) {
      try {
        resourceDisposer(resource);
      } catch (ex2) {
        EmptySubscription.error(actual, ex2);
        return;
      }
      EmptySubscription.error(
        actual,
        new Error('The publisherFactory returned a null Publisher'),
      );
      return;
    }

    p.subscribe(new UsingSubscriber(actual, resource, resourceDisposer, eager));
  }

  _actual: Subscriber<T>;
  _resource: R;
  _resourceDisposer: (resource: R) => void;
  _eager: boolean;

  _s: Subscription;
  _once: boolean = false;

  constructor(
    actual: Subscriber<T>,
    resource: R,
    resourceDisposer: (resource: R) => void,
    eager: boolean,
  ) {
    this._actual = actual;
    this._resource = resource;
    this._resourceDisposer = resourceDisposer;
    this._eager = eager;
  }

  onSubscribe(s: Subscription): void {
    if (SH.validSubscription(this._s, s)) {
      this._s = s;

      this._actual.onSubscribe(this);
    }
  }

  onNext(t: T): void {
    this._actual.onNext(t);
  }

  onError(t: Error): void {
    if (this._eager) {
      if (!this._once) {
        this._once = true;
        try {
          this._resourceDisposer(this._resource);
        } catch (ex) {
          t = new Error(t.message + '\n' + ex.message);
        }
      }
    }

    this._actual.onError(t);

    if (!this._eager) {
      if (!this._once) {
        this._once = true;
        try {
          this._resourceDisposer(this._resource);
        } catch (ex) {
          console.log(ex);
        }
      }
    }
  }

  onComplete(): void {
    if (this._eager) {
      if (!this._once) {
        this._once = true;
        try {
          this._resourceDisposer(this._resource);
        } catch (ex) {
          this._actual.onError(ex);
          return;
        }
      }
    }

    this._actual.onComplete();

    if (!this._eager) {
      if (!this._once) {
        this._once = true;
        try {
          this._resourceDisposer(this._resource);
        } catch (ex) {
          console.log(ex);
        }
      }
    }
  }

  request(n: number): void {
    this._s.request(n);
  }

  cancel(): void {
    if (!this._once) {
      this._once = true;
      this._s.cancel();
      try {
        this._resourceDisposer(this._resource);
      } catch (ex) {
        console.log(ex);
      }
    }
  }
}
