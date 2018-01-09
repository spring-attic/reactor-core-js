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

import { Cancellation, Cancellations, CallbackCancellation } from './flow';

/** Provides an abstract asychronous boundary to operators. */
export interface Scheduler {
  schedule(task: () => void): Cancellation;

  createWorker(): Worker;
}

/**
 * A worker representing an asynchronous boundary that executes tasks in
 * a FIFO order, guaranteed non-concurrently with respect to each other.
 */
export interface Worker {
  schedule(task: () => void): Cancellation;

  shutdown(): void;
}

export interface TimedScheduler extends Scheduler {
  scheduleDelayed(task: () => void, delay: number): Cancellation;

  schedulePeriodic(
    task: () => void,
    initialDelay: number,
    period: number,
  ): Cancellation;

  createWorker(): TimedWorker;
}

export interface TimedWorker extends Worker {
  scheduleDelayed(task: () => void, delay: number): Cancellation;

  schedulePeriodic(
    task: () => void,
    initialDelay: number,
    period: number,
  ): Cancellation;
}

export class DefaultScheduler implements TimedScheduler {
  static _INSTANCE = new DefaultScheduler();

  static get INSTANCE(): TimedScheduler {
    return DefaultScheduler._INSTANCE;
  }

  schedule(task: () => void): Cancellation {
    const id = setTimeout(task, 0);
    return new CallbackCancellation(() => clearTimeout(id));
  }

  scheduleDelayed(task: () => void, delay: number): Cancellation {
    const id = setTimeout(task, delay);
    return new CallbackCancellation(() => clearTimeout(id));
  }

  schedulePeriodic(
    task: () => void,
    initialDelay: number,
    period: number,
  ): Cancellation {
    const pt = new PeriodicTask(task);

    pt.initialId = setTimeout(() => {
      task();

      pt.periodId = setInterval(pt.run, period);
    }, initialDelay);

    return pt;
  }

  createWorker(): TimedWorker {
    return new DefaultWorker();
  }
}

class DefaultWorker implements TimedWorker {
  _shutdown: boolean;
  _tasks: Array<number>;

  constructor() {
    this._shutdown = false;
    this._tasks = [];
  }

  schedule(task: () => void): Cancellation {
    if (this._shutdown) {
      return Cancellations.REJECTED;
    }

    const wt = new WorkerTask(this, task);

    const id = setTimeout(wt.run, 0);
    this._tasks.push(id);
    wt.id = id;

    return wt;
  }

  scheduleDelayed(task: () => void, delay: number): Cancellation {
    if (this._shutdown) {
      return Cancellations.REJECTED;
    }

    const wt = new WorkerTask(this, task);

    const id = setTimeout(wt.run, delay);
    this._tasks.push(id);
    wt.id = id;

    return wt;
  }

  schedulePeriodic(
    task: () => void,
    initialDelay: number,
    period: number,
  ): Cancellation {
    if (this._shutdown) {
      return Cancellations.REJECTED;
    }

    const wt = new WorkerPeriodicTask(this, task);

    const initialId = setTimeout(() => {
      if (wt.initialId != null) {
        this.remove(wt.initialId);
        wt.initialId = null;
      }

      task();

      const periodId = setInterval(wt.run, period);
      this._tasks.push(periodId);
      wt.periodId = periodId;
    }, initialDelay);
    this._tasks.push(initialId);
    wt.initialId = initialId;

    return wt;
  }

  shutdown(): void {
    this._shutdown = true;
    for (const n of this._tasks) {
      clearTimeout(n);
    }
    this._tasks.length = 0;
  }

  remove(id: number): void {
    const idx = this._tasks.indexOf(id);
    if (idx >= 0) {
      this._tasks.splice(idx, 1);
    }
  }
}

class WorkerTask implements Cancellation {
  id: number;

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
      this._parent.remove(this.id);
    }
  }

  dispose(): void {
    clearTimeout(this.id);
    this._parent.remove(this.id);
  }
}

class WorkerPeriodicTask implements Cancellation {
  initialId: ?number;
  periodId: ?number;

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
        this._parent.remove(periodId);
      }
    }
  }

  dispose(): void {
    if (this.initialId != null) {
      const initialId = this.initialId;
      clearTimeout(initialId);
      this._parent.remove(initialId);
      this.initialId = null;
    }
    if (this.periodId != null) {
      const periodId = this.periodId;
      clearInterval(periodId);
      this._parent.remove(periodId);
      this.periodId = null;
    }
  }
}

class PeriodicTask implements Cancellation {
  initialId: ?number;

  periodId: ?number;

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
