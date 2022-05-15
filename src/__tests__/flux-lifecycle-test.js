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
import { TestSubscriber } from '../subscriber'
import { Subscription } from "../reactivestreams-spec";

describe('FluxDoOnLifecycle', () => {
  it('normal', () => {
    const ts = new TestSubscriber();
    let onSubscribe: ?Subscription;
    let onNext: ?number = null;
    let onError: ?Error = null;
    let onComplete = false;
    let onAfterTerminated = false;
    let onRequest = 0;
    let onCancel = false;
    Flux.just(1).hide()
        .doOnSubscribe(s => {onSubscribe = s;})
        .doOnNext(v => {onNext = v;})
        .doOnError(e => {onError = e;})
        .doOnComplete(() => {onComplete = true;})
        .doAfterTerminated(() => {onAfterTerminated = true;})
        .doOnRequest(n => {onRequest = n;})
        .doOnCancel(() => {onCancel = true;})
        .subscribe(ts);

    expect(onSubscribe).to.not.be.null;
    expect(onNext).to.equal(1);
    expect(onError).to.be.null;
    expect(onComplete).to.be.true;
    expect(onAfterTerminated).to.be.true;
    expect(onRequest).to.equal(Infinity);
    expect(onCancel).to.be.false;
  });
  it('error', () => {
    const ts = new TestSubscriber();
    let onSubscribe: ?Subscription = null;
    let onNext: ?number = null;
    let onError: ?Error = null;
    let onComplete = false;
    let onAfterTerminated = false;
    let onRequest = 0;
    let onCancel = false;
    Flux.fromCallable(() => {throw new Error('forced failure');}).hide()
        .doOnSubscribe(s => {onSubscribe = s;})
        .doOnNext(v => {onNext = v;})
        .doOnError(e => {onError = e;})
        .doOnComplete(() => {onComplete = true;})
        .doAfterTerminated(() => {onAfterTerminated = true;})
        .doOnRequest(n => {onRequest = n;})
        .doOnCancel(() => {onCancel = true;})
        .subscribe(ts);

    expect(onSubscribe).to.not.be.null;
    expect(onNext).to.be.null;
    expect(onError).to.be.an('error');
    expect(onComplete).to.be.false;
    expect(onAfterTerminated).to.be.true;
    expect(onRequest).to.equal(Infinity);
    expect(onCancel).to.be.false;
  });
  it('empty', () => {
    const ts = new TestSubscriber();
    let onSubscribe: ?Subscription = null;
    let onNext: ?number = null;
    let onError: ?Error = null;
    let onComplete = false;
    let onAfterTerminated = false;
    let onRequest = 0;
    let onCancel = false;
    Flux.empty()
        .doOnSubscribe(s => {onSubscribe = s;})
        .doOnNext(v => {onNext = v;})
        .doOnError(e => {onError = e;})
        .doOnComplete(() => {onComplete = true;})
        .doAfterTerminated(() => {onAfterTerminated = true;})
        .doOnRequest(n => {onRequest = n;})
        .doOnCancel(() => {onCancel = true;})
        .subscribe(ts);

    expect(onSubscribe).to.not.be.null;
    expect(onNext).to.be.null;
    expect(onError).to.be.null;
    expect(onComplete).to.be.true;
    expect(onAfterTerminated).to.be.true;
    expect(onRequest).to.equal(Infinity);
    expect(onCancel).to.be.false;
  });
  it('never', () => {
    const ts = new TestSubscriber();
    let onSubscribe: ?Subscription = null;
    let onNext: ?number = null;
    let onError: ?Error = null;
    let onComplete = false;
    let onAfterTerminated = false;
    let onRequest = 0;
    let onCancel = false;
    Flux.never()
        .doOnSubscribe(s => {onSubscribe = s;})
        .doOnNext(v => {onNext = v;})
        .doOnError(e => {onError = e;})
        .doOnComplete(() => {onComplete = true;})
        .doAfterTerminated(() => {onAfterTerminated = true;})
        .doOnRequest(n => {onRequest = n;})
        .doOnCancel(() => {onCancel = true;})
        .subscribe(ts);

    expect(onSubscribe).to.not.be.null;
    expect(onNext).to.be.null;
    expect(onError).to.be.null;
    expect(onComplete).to.be.false;
    expect(onAfterTerminated).to.be.false;
    expect(onRequest).to.equal(Infinity);
    expect(onCancel).to.be.false;
  });
  it('never cancel', () => {
    const ts = new TestSubscriber();
    let onSubscribe: ?Subscription = null;
    let onNext: ?number = null;
    let onError: ?Error = null;
    let onComplete = false;
    let onAfterTerminated = false;
    let onRequest = 0;
    let onCancel = false;
    Flux.never()
        .doOnSubscribe(s => {onSubscribe = s;})
        .doOnNext(v => {onNext = v;})
        .doOnError(e => {onError = e;})
        .doOnComplete(() => {onComplete = true;})
        .doAfterTerminated(() => {onAfterTerminated = true;})
        .doOnRequest(n => {onRequest = n;})
        .doOnCancel(() => {onCancel = true;})
        .subscribe(ts);

    expect(onSubscribe).to.not.be.null;
    expect(onNext).to.be.null;
    expect(onError).to.be.null;
    expect(onComplete).to.be.false;
    expect(onAfterTerminated).to.be.false;
    expect(onRequest).to.equal(Infinity);
    expect(onCancel).to.be.false;

    ts.cancel();

    expect(onCancel).to.be.true;
  });
  it('callback error', () => {
    const ts = new TestSubscriber();
    Flux.just(1).hide()
        .doOnNext(() => {throw new Error("test");})
        .subscribe(ts);
    ts.assertError("test");
  });
  it('complete callback error', () => {
    const ts = new TestSubscriber();
    Flux.just(1).hide()
        .doOnComplete(() => {throw new Error("test");})
        .subscribe(ts);
    ts.assertError("test");
  });
  it('error callback error', () => {
    const ts = new TestSubscriber();
    Flux.fromCallable(() => {throw new Error('bar');})
        .doOnError(() => {throw new Error('test');})
        .subscribe(ts);

    ts.assertNoValues();
    ts.assertError('bar');
  });
  it('after terminated callback error does not invoke onError', () => {
    const ts = new TestSubscriber();
    Flux.empty()
        .doAfterTerminated(() => {throw new Error('test');})
        .subscribe(ts);

    ts.assertNoValues();
    ts.assertComplete();
    ts.assertNoError();
  });
});
