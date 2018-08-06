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
});
