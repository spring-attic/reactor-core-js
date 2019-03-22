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

import { expect } from 'chai';
import { describe, it } from 'mocha';
import { Flux } from '../flux';
import {TestSubscriber} from '../subscriber'

describe('Flux Tests', () => {
  describe('FluxJust', () => {
    it('normal', () => {
      const ts = new TestSubscriber();
      Flux.just('test').subscribe(ts);

      return ts.await().then(() => {
        ts.assertValue('test');
        ts.assertComplete();
        ts.assertNoError();
      });
    });

    it('cancel', () => {
      const x = Flux.just('test');
      const c = x.subscribe(t => {});
      c.dispose();
    });
  });
  describe('FluxInterval', () => {
    it('normal', () => {
      const ts = new TestSubscriber();
      Flux.interval(100, 100)
          .take(5)
          .map(() => Date.now())
          .subscribe(ts);
      return ts.await().then(() => {
        ts.assertValueCount(5);
        ts.assertNoError();
        ts.assertComplete();
        const values = ts._values;
        for (let i = 0; i < values.length - 1; i++)
        {
            const diff = values[i + 1] - values[i];
            expect(diff).to.be.within(50, 150, "period failure: " + diff);
        }
      });
    });
  });
  describe('FluxTimer', () => {
    it('normal', () => {
      const ts = new TestSubscriber();
      Flux.timer(100)
          .subscribe(ts);
      let timeout = new Promise((resolve, reject) => {
        let id = setTimeout(() => {
          clearTimeout(id);
          reject('Timed out');
        }, 150);
      });
      return Promise.race([timeout, ts.await()]).then(() => {
        ts.assertValues([0]);
        ts.assertNoError();
        ts.assertComplete();
      });
    });
  });
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
  });
  describe('FluxConcatMap', () => {
    it('normal', () => {
      const ts = new TestSubscriber();
      Flux.range(1, 2)
          .concatMap(v => Flux.range(v, 2))
          .subscribe(ts);

      return ts.await().then(() => {
        ts.assertValues([1, 2, 2, 3]);
        ts.assertNoError();
        ts.assertComplete();
      });
    });
  });
  describe('FluxTake', () => {
    it('normal', () => {
      const ts = new TestSubscriber();
      Flux.range(1, 10)
          .take(5)
          .subscribe(ts);
      ts.await().then(() => {
        ts.assertValues([1, 2, 3, 4, 5]);
        ts.assertComplete();
        ts.assertNoError();
      });
    });
  });
  describe('FluxZip', () => {
    it('normal', () => {
      const ts = new TestSubscriber();
      const flux1 = Flux.just(1);
      const flux2 = Flux.just(2);
      const flux3 = Flux.just(3);
      const flux4 = Flux.just(4);
      const flux5 = Flux.just(5);
      Flux.zip([flux1, flux2, flux3, flux4, flux5], v => JSON.stringify(v))
          .subscribe(ts);
      return ts.await().then(() => {
        ts.assertValue('[1,2,3,4,5]');
        ts.assertComplete();
        ts.assertNoError();
      });
    });
    it('prefetch', () => {
      const ts = new TestSubscriber(1);
      Flux.zip([Flux.just(1), Flux.just(2)], ([a1, a2]) => a1 + a2, 1)
          .subscribe(ts);
      return ts.await().then(() => {
        ts.assertValue(3);
        ts.assertComplete();
        ts.assertNoError();
      });
    });
  });
});
