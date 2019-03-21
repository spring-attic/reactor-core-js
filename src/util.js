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

import { Queue } from './flow';

/** A single-producer, single-consumer, fixed power-of-2 capacity queue implementation. */
export class SpscArrayQueue<T> implements Queue<T> {
  _mask: number;
  _array: Array<?T>;
  _producerIndex: number;
  _consumerIndex: number;

  constructor(capacity: number) {
    if ((capacity & (capacity - 1)) !== 0) {
      throw new Error('capacity must be power-of-2');
    }
    this._mask = capacity - 1;
    const a = new Array(capacity);
    a.fill(null);
    this._array = a;
    this._producerIndex = 0;
    this._consumerIndex = 0;
  }

  offer(t: T): boolean {
    if (t == null) {
      throw new Error('t is null');
    }
    const a = this._array;
    const m = this._mask;
    const pi = this._producerIndex;
    const o = pi & m;

    if (a[o] != null) {
      return false;
    }
    a[o] = t;
    this._producerIndex = pi + 1;
    return true;
  }

  poll(): ?T {
    const a = this._array;
    const m = this._mask;
    const ci = this._consumerIndex;
    const o = ci & m;

    const v = a[o];
    if (v != null) {
      a[o] = null;
      this._consumerIndex = ci + 1;
    }
    return v;
  }

  isEmpty(): boolean {
    return this._producerIndex == this._consumerIndex;
  }

  size(): number {
    return this._producerIndex - this._consumerIndex;
  }

  clear(): void {
    while (this.poll() != null) {}
  }
}

/** A single-producer, single-consumer, growing power-of-2 capacity queue implementation. */
export class SpscLinkedArrayQueue<T> implements Queue<T> {
  _mask: number;
  _producerIndex: number;
  _producerArray: Array<any>;
  _consumerIndex: number;
  _consumerArray: Array<any>;

  static NEXT = {};

  constructor(capacity: number) {
    if ((capacity & (capacity - 1)) != 0) {
      throw new Error('capacity must be power-of-2');
    }
    if (capacity < 2) {
      capacity = 2;
    }
    this._mask = capacity - 1;
    const a = new Array(capacity + 1);
    a.fill(null);
    this._producerArray = a;
    this._producerIndex = 0;
    this._consumerArray = a;
    this._consumerIndex = 0;
  }

  offer(t: T): boolean {
    if (t == null) {
      throw new Error('t is null');
    }
    const a = this._producerArray;
    const m = this._mask;
    const pi = this._producerIndex;
    const o1 = (pi + 1) & m;
    const o = pi & m;

    if (a[o1] != null) {
      const b = new Array(m + 2);
      b[o] = t;
      a[m + 1] = b;
      this._producerArray = b;
      a[o] = SpscLinkedArrayQueue.NEXT;
      this._producerIndex = pi + 1;
    } else {
      a[o] = t;
      this._producerIndex = pi + 1;
    }
    return true;
  }

  poll(): T {
    const a = this._consumerArray;
    const m = this._mask;
    const ci = this._consumerIndex;
    const o = ci & m;

    let v = a[o];
    if (v != null) {
      if (v == SpscLinkedArrayQueue.NEXT) {
        const b: Array<any> = a[m + 1];
        a[m + 1] = null;
        this._consumerArray = b;
        v = b[o];
        b[o] = null;
      } else {
        a[o] = null;
      }
      this._consumerIndex = ci + 1;
    }
    return v;
  }

  isEmpty(): boolean {
    return this._producerIndex == this._consumerIndex;
  }

  size(): number {
    return this._producerIndex - this._consumerIndex;
  }

  clear(): void {
    while (this.poll() != null) {}
  }
}

/** A fixed size buffer that overwrites old entries. */
export class RingBuffer<T> {
  array: Array<?T>;
  producerIndex: number = 0;
  consumerIndex: number = 0;

  constructor(capacity: number) {
    this.array = new Array(capacity);
    this.array.fill(null);
  }

  offer(t: T): void {
    const a = this.array;

    let pi = this.producerIndex;
    a[pi++] = t;

    if (pi == a.length) {
      this.producerIndex = 0;
    } else {
      this.producerIndex = pi;
    }
    let ci = this.consumerIndex;
    if (pi == ci) {
      ci++;
      if (ci == a.length) {
        this.consumerIndex = 0;
      } else {
        this.consumerIndex = ci;
      }
    }
  }

  poll(): ?T {
    const a = this.array;
    let ci = this.consumerIndex;

    const v = a[ci];
    if (v != null) {
      a[ci] = null;
      ci++;
      if (ci == a.length) {
        this.consumerIndex = 0;
      } else {
        this.consumerIndex = ci;
      }
    }
    return v;
  }

  isEmpty(): boolean {
    return this.array[this.consumerIndex] == null;
  }

  clear(): void {
    this.array.fill(null);
    this.consumerIndex = 0;
    this.producerIndex = 0;
  }

  size(): number {
    if (this.isEmpty()) {
      return 0;
    }
    const pi = this.producerIndex;
    const ci = this.consumerIndex;
    if (ci == pi) {
      return this.array.length;
    } else if (pi > ci) {
      return pi - ci;
    }
    return this.array.length - ci + pi;
  }

  isFull(): boolean {
    const pi = this.producerIndex;
    const ci = this.consumerIndex;
    if (ci == pi) {
      return this.array[ci] != null;
    }
    return false;
  }
}
