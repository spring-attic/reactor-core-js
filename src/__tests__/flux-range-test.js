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
import {Flux} from '../flux';
import {TestSubscriber} from '../subscriber'

describe('Flux Range Tests', () => {
  describe('FluxRange', () => {
    it('normal', () => {
      const ts = new TestSubscriber();
      Flux.range(1, 10).subscribe(ts);
      return ts.await().then(() => {
        ts.assertNoError();
        ts.assertValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        ts.assertComplete();
      });
    });
    it('normal back-pressured', () => {
      const ts = new TestSubscriber(0);
      Flux.range(1, 10).subscribe(ts);

      ts.assertNoValues();
      ts.assertNoError();
      ts.assertNotComplete();

      ts.request(5);

      ts.assertValues([1, 2, 3, 4, 5]);
      ts.assertNoError();
      ts.assertNotComplete();

      ts.request(10);

      ts.assertValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      ts.assertNoError();
      ts.assertComplete();
    });
    it('normal back-pressured exact', () => {
      const ts = new TestSubscriber(0);
      Flux.range(1, 10).subscribe(ts);

      ts.assertNoValues();
      ts.assertNoError();
      ts.assertNotComplete();

      ts.request(10);

      ts.assertValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      ts.assertNoError();
      ts.assertComplete();
    });
    it('normal negative start', () => {
      const ts = new TestSubscriber();
      Flux.range(-10, 2).subscribe(ts);
      return ts.await().then(() => {
        ts.assertNoError();
        ts.assertValues([-10, -9]);
        ts.assertComplete();
      });
    });

  });
  describe('FluxArray', () => {
    it('normal', () => {
      const ts = new TestSubscriber();
      Flux.fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).subscribe(ts);
      return ts.await().then(() => {
        ts.assertNoError();
        ts.assertValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        ts.assertComplete();
      });
    });
    it('normal back-pressured', () => {
      const ts = new TestSubscriber(0);
      Flux.fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).subscribe(ts);

      ts.assertNoValues();
      ts.assertNoError();
      ts.assertNotComplete();

      ts.request(5);

      ts.assertValues([1, 2, 3, 4, 5]);
      ts.assertNoError();
      ts.assertNotComplete();

      ts.request(10);

      ts.assertValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      ts.assertNoError();
      ts.assertComplete();
    });
    it('normal back-pressured exact', () => {
      const ts = new TestSubscriber(0);
      Flux.fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).subscribe(ts);

      ts.assertNoValues();
      ts.assertNoError();
      ts.assertNotComplete();

      ts.request(10);

      ts.assertValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      ts.assertNoError();
      ts.assertComplete();
    });
    it('array contains null', () => {
      const ts = new TestSubscriber();
      Flux.fromArray([1, 2, 3, 4, 5, null, 7, 8, 9, 10]).subscribe(ts);

      return ts.await().then(() => {
        ts.assertError('element was null');
        ts.assertValues([1, 2, 3, 4, 5]);
        ts.assertNotComplete();
      });
    });
  });
});
