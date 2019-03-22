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
import { Disposable } from './flow';
import { SH, EmptySubscription } from './subscription';

export class CallbackSubscriber<T> implements Subscriber<T>, Disposable {
  _onNext: (t: T) => void;
  _onError: (t: Error) => void;
  _onComplete: () => void;

  _done: boolean;
  _s: Subscription;

  constructor(
    onNext: (t: T) => void,
    onError: (t: Error) => void,
    onComplete: () => void,
  ) {
    this._onNext = onNext;
    this._onError = onError;
    this._onComplete = onComplete;
  }

  onSubscribe(s: Subscription): void {
    if (this._s != null) {
      if (this._s != EmptySubscription.INSTANCE) {
        throw new Error('Subscription already set');
      }
      s.cancel();
      return;
    }
    this._s = s;
    s.request(Infinity);
  }

  onNext(t: T): void {
    if (this._done) {
      return;
    }
    try {
      this._onNext(t);
    } catch (ex) {
      this._s.cancel();
      this.onError(ex);
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
      console.log(t);
      console.log(ex);
    }
  }

  onComplete(): void {
    if (this._done) {
      return;
    }
    this._done = true;
    try {
      this._onComplete();
    } catch (ex) {
      console.log(ex);
    }
  }

  dispose(): void {
    const a = this._s;
    this._s = EmptySubscription.INSTANCE;
    if (a != null && a != EmptySubscription.INSTANCE) {
      a.cancel();
    }
  }
}

/** Provides convenient assertXXX checks on the received signal pattern. */
export class TestSubscriber<T> implements Subscriber<T>, Subscription {
  _requested: number;

  _s: Subscription;

  _subscriptionChecked: boolean;

  _completions: number;

  _values: Array<T>;

  _errors: Array<Error>;

  _promise: Promise<void>;
  _done: () => void;

  constructor(initialRequest?: number) {
    if (initialRequest == null) {
      this._requested = Infinity;
    } else {
      this._requested = initialRequest;
    }
    this._subscriptionChecked = false;
    this._completions = 0;
    this._values = [];
    this._errors = [];
    this._promise = new Promise(done => {
      this._done = done;
    });
  }

  onSubscribe(s: Subscription): void {
    if (this._s != null) {
      if (this._s == SH.CANCELLED) {
        s.cancel();
        return;
      }
      this._errors.push(new Error('Subscription already set'));
      s.cancel();
    } else {
      this._s = s;
      const r = this._requested;
      if (r != 0) {
        this._requested = 0;
        s.request(r);
      }
    }
  }

  onNext(t: T): void {
    if (!this._subscriptionChecked) {
      this._subscriptionChecked = true;
      if (this._s == null) {
        this._errors.push(new Error('onSubscribe not called before onNext'));
      }
    }
    this._values.push(t);
  }

  onError(t: Error): void {
    if (!this._subscriptionChecked) {
      this._subscriptionChecked = true;
      if (this._s == null) {
        this._errors.push(new Error('onSubscribe not called before onError'));
      }
    }
    this._errors.push(t);
    this._done();
  }

  onComplete(): void {
    if (!this._subscriptionChecked) {
      this._subscriptionChecked = true;
      if (this._s == null) {
        this._errors.push(
          new Error('onSubscribe not called before onComplete'),
        );
      }
    }
    this._completions++;
    this._done();
  }

  request(n: number): void {
    if (n <= 0) {
      this._errors.push(new Error('n > 0 required but it was ' + n));
    } else {
      if (this._s == null) {
        this._requested += n;
      } else {
        this._s.request(n);
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

  await(): Promise<void> {
    return this._promise;
  }

  error(message: string): void {
    let m =
      message +
      ' (' +
      this._completions +
      ' completions)' +
      ' (' +
      this._errors.length +
      ' errors)';

    for (const e of this._errors) {
      m += '\n';
      m += e.message;
    }

    throw new Error(m);
  }

  assertNoValues(): void {
    if (this._values.length != 0) {
      this.error(
        'No values expected but ' +
          this._values.length +
          ' received:\n' +
          String(this._values) +
          '\n',
      );
    }
  }

  assertNoError(): void {
    if (this._errors.length != 0) {
      this.error('No errors expected');
    }
  }

  assertComplete(): void {
    if (this._completions == 0) {
      this.error('Completion expected');
    }
    if (this._completions > 1) {
      this.error('Single completion expected');
    }
  }

  assertNotComplete(): void {
    if (this._completions != 0) {
      this.error('No completion expected');
    }
  }

  assertError(messagePart: string): void {
    if (this._errors.length != 1) {
      this.error('Single error expected');
    } else {
      if (this._errors[0].message.indexOf(messagePart) < 0) {
        this.error("Error message doesn't contain '" + messagePart + "'");
      }
    }
  }

  assertValue(v: T): void {
    if (this._values.length == 0) {
      this.error('Expected: ' + String(v) + ' but no values received');
    }
    if (this._values.length != 1) {
      this.error(
        'Expected: ' +
          String(v) +
          ' but ' +
          this._values.length +
          ' values received:\n' +
          String(this._values) +
          '\n',
      );
    }
    if (this._values[0] != v) {
      this.error(
          'Value differ. Expected: ' +
          String(v) +
          '; Actual: ' +
          String(this._values[0]),
      )
    }
  }

  assertValueCount(n: number): void {
    if (this._values.length != n) {
      this.error(
        '' +
          n +
          ' values expected but ' +
          this._values.length +
          ' values received',
      );
    }
  }

  assertValues(v: Array<T>): void {
    if (this._values.length != v.length) {
      this.error(
        'Number of values differ. Expected: [' +
          v.length +
          '] ' +
          String(v) +
          '; Actual: [' +
          this._values.length +
          '] ' +
          String(this._values) +
          '\n',
      );
    }

    for (let i = 0; i < v.length; i++) {
      const o1 = v[i];
      const o2 = this._values[i];

      if (o1 != o2) {
        this.error(
          'Values @ ' +
            i +
            ' differ. Expected: ' +
            String(o1) +
            '; Actual: ' +
            String(o2),
        );
      }
    }
  }

  assertSubscribed() {
    if (this._s == null) {
      this.error('onSubscribe not called');
    }
  }
}
