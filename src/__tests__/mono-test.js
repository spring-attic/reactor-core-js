/**
 * Copyright (c) 2016-2018 Pivotal Software Inc, All Rights Reserved.
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

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {Mono} from '../mono';
import {TestSubscriber} from '../subscriber'

describe('Mono Tests', () => {
  describe('MonoPromise', () => {
    it('resolved', () => {
      const ts = new TestSubscriber();
      Mono.fromPromise(Promise.resolve('test'))
          .subscribe(ts);
      return ts.await().then(() => {
        ts.assertValue('test');
        ts.assertComplete();
        ts.assertNoError();
      });
    });
    it('rejected', () => {
      const ts = new TestSubscriber();
      Mono.fromPromise(Promise.reject(new Error('test')))
          .subscribe(ts);
      return ts.await().then(() => {
        ts.assertNotComplete();
        ts.assertError('test');
      });
    });
    it('cancel', () => {
      const ts = new TestSubscriber();
      let cancelCalled = false;
      const p = new Promise(resolve => {
        let maybeResolve = function () {
          if (cancelCalled) {
            resolve('test');
          } else {
            setTimeout(maybeResolve, 0);
          }
        };
        setTimeout(maybeResolve, 0);
      });
      Mono.fromPromise(p).subscribe(ts);
      ts.cancel();
      cancelCalled = true;
      return p.then(() => {
        ts.assertSubscribed();
        ts.assertNoValues();
        ts.assertNoError();
        ts.assertNotComplete();
      });
    });
  });
});
