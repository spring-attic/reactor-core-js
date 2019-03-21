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

import { Disposable, Disposables, CallbackDisposable } from './flow';

/** Provides an abstract asychronous boundary to operators. */
export interface Scheduler {
  schedule(task: () => void): Disposable;

  createWorker(): Worker;
}

/**
 * A worker representing an asynchronous boundary that executes tasks in
 * a FIFO order, guaranteed non-concurrently with respect to each other.
 */
export interface Worker {
  schedule(task: () => void): Disposable;

  shutdown(): void;
}

export interface TimedScheduler extends Scheduler {
  scheduleDelayed(task: () => void, delay: number): Disposable;

  schedulePeriodic(
    task: () => void,
    initialDelay: number,
    period: number,
  ): Disposable;

  createWorker(): TimedWorker;
}

export interface TimedWorker extends Worker {
  scheduleDelayed(task: () => void, delay: number): Disposable;

  schedulePeriodic(
    task: () => void,
    initialDelay: number,
    period: number,
  ): Disposable;
}

export class DefaultScheduler implements TimedScheduler {
  static _INSTANCE = new DefaultScheduler();

  static get INSTANCE(): TimedScheduler {
    return DefaultScheduler._INSTANCE;
  }

  schedule(task: () => void): Disposable {
    const id = setTimeout(task, 0);
    return new CallbackDisposable(() => clearTimeout(id));
  }

  scheduleDelayed(task: () => void, delay: number): Disposable {
    const id = setTimeout(task, delay);
    return new CallbackDisposable(() => clearTimeout(id));
  }

  schedulePeriodic(
    task: () => void,
    initialDelay: number,
    period: number,
  ): Disposable {
    const pt = new PeriodicTask(task);

    pt.initialId = setTimeout(() => {
      task();

      pt.periodId = setInterval(() => pt.run(), period);
    }, initialDelay);

    return pt;
  }

  createWorker(): TimedWorker {
    return new DefaultWorker();
  }
}

class DefaultWorker implements TimedWorker {
  _shutdown: boolean;
  _timeouts: Array<TimeoutID>;
  _intervals: Array<IntervalID>;

  constructor() {
    this._shutdown = false;
    this._timeouts = [];
    this._intervals = [];
  }

  schedule(task: () => void): Disposable {
    if (this._shutdown) {
      return Disposables.REJECTED;
    }

    const wt = new WorkerTask(this, task);

    const id = setTimeout(wt.run, 0);
    this._timeouts.push(id);
    wt.id = id;

    return wt;
  }

  scheduleDelayed(task: () => void, delay: number): Disposable {
    if (this._shutdown) {
      return Disposables.REJECTED;
    }

    const wt = new WorkerTask(this, task);

    const id = setTimeout(wt.run, delay);
    this._timeouts.push(id);
    wt.id = id;

    return wt;
  }

  schedulePeriodic(
    task: () => void,
    initialDelay: number,
    period: number,
  ): Disposable {
    if (this._shutdown) {
      return Disposables.REJECTED;
    }

    const wt = new WorkerPeriodicTask(this, task);

    const initialId = setTimeout(() => {
      if (wt.initialId != null) {
        this.removeTimeout(wt.initialId);
        wt.initialId = null;
      }

      task();

      const periodId = setInterval(wt.run, period);
      this._intervals.push(periodId);
      wt.periodId = periodId;
    }, initialDelay);
    this._timeouts.push(initialId);
    wt.initialId = initialId;

    return wt;
  }

  shutdown(): void {
    this._shutdown = true;
    for (const n of this._timeouts) {
      clearTimeout(n);
    }
    this._timeouts.length = 0;
    for (const n of this._intervals) {
      clearInterval(n);
    }
    this._intervals.length = 0;
  }

  removeTimeout(id: TimeoutID): void {
    const idx = this._timeouts.indexOf(id);
    if (idx >= 0) {
      this._timeouts.splice(idx, 1);
    }
  }

  removeInterval(id: IntervalID): void {
    const idx = this._intervals.indexOf(id);
    if (idx >= 0) {
      this._intervals.splice(idx, 1);
    }
  }
}

class WorkerTask implements Disposable {
  id: TimeoutID;

  _parent: DefaultWorker;
  _task: () => void;

  constructor(parent: DefaultWorker, task: () => void) {
    this._parent = parent;
    this._task = task;
  }

  run(): void {
    try {
      this._task();
    } finally {
      this._parent.removeTimeout(this.id);
    }
  }

  dispose(): void {
    clearTimeout(this.id);
    this._parent.removeTimeout(this.id);
  }
}

class WorkerPeriodicTask implements Disposable {
  initialId: ?TimeoutID;
  periodId: ?IntervalID;

  _parent: DefaultWorker;
  _task: () => void;

  constructor(parent: DefaultWorker, task: () => void) {
    this._parent = parent;
    this._task = task;
  }

  run(): void {
    try {
      this._task();
    } catch (ex) {
      console.log(ex);
      if (this.periodId != null) {
        const periodId = this.periodId;
        clearInterval(periodId);
        this._parent.removeInterval(periodId);
      }
    }
  }

  dispose(): void {
    if (this.initialId != null) {
      const initialId = this.initialId;
      clearTimeout(initialId);
      this._parent.removeTimeout(initialId);
      this.initialId = null;
    }
    if (this.periodId != null) {
      const periodId = this.periodId;
      clearInterval(periodId);
      this._parent.removeInterval(periodId);
      this.periodId = null;
    }
  }
}

class PeriodicTask implements Disposable {
  initialId: ?TimeoutID;
  periodId: ?IntervalID;

  _task: () => void;

  constructor(task: () => void) {
    this._task = task;
  }

  run(): void {
    try {
      this._task();
    } catch (ex) {
      console.log(ex);
      this.dispose();
    }
  }

  dispose(): void {
    if (this.initialId != null) {
      clearTimeout(this.initialId);
      this.initialId = null;
    }
    if (this.periodId != null) {
      clearInterval(this.periodId);
      this.periodId = null;
    }
  }
}
