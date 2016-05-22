import * as flow from './flow';

/** Provides an abstract asychronous boundary to operators. */
export interface Scheduler {
    schedule(task: () => void) : flow.Cancellation;
    
    createWorker() : Worker;
}

/** 
 * A worker representing an asynchronous boundary that executes tasks in
 * a FIFO order, guaranteed non-concurrently with respect to each other. 
 */
export interface Worker {
    schedule(task: () => void) : flow.Cancellation;

    shutdown() : void;    
}

export interface TimedScheduler extends Scheduler {
    
    scheduleDelayed(task: () => void, delay: number) : flow.Cancellation;
    
    schedulePeriodic(task: () => void, initialDelay: number, period: number) : flow.Cancellation;

    createWorker() : TimedWorker;
}

export interface TimedWorker extends Worker {

    scheduleDelayed(task: () => void, delay: number) : flow.Cancellation;
    
    schedulePeriodic(task: () => void, initialDelay: number, period: number) : flow.Cancellation;
}


export class DefaultScheduler implements TimedScheduler {
    private static P_INSTANCE = new DefaultScheduler();
    
    public static get INSTANCE() : TimedScheduler { return DefaultScheduler.P_INSTANCE; }

    schedule(task: () => void) : flow.Cancellation {
        const id = setTimeout(task, 0);
        return new flow.CallbackCancellation(() => clearTimeout(id));
    }
    
    scheduleDelayed(task: () => void, delay: number) : flow.Cancellation {
        const id = setTimeout(task, delay);
        return new flow.CallbackCancellation(() => clearTimeout(id));
    }
    
    schedulePeriodic(task: () => void, initialDelay: number, period: number) : flow.Cancellation {
        const pt = new PeriodicTask(task);
        
        pt.initialId = setTimeout(() => {
            task();
            
            pt.periodId = setInterval(pt.run, period);
        }, initialDelay);
        
        return pt;        
    }
    
    createWorker() : TimedWorker {
        return new DefaultWorker();
    }
}

class DefaultWorker implements TimedWorker {
    private mShutdown : boolean;
    
    private mTasks : Array<number>;
    
    constructor() {
        this.mShutdown = false;
        this.mTasks = new Array<number>();
    }
    
    schedule(task: () => void) : flow.Cancellation {
        if (this.mShutdown) {
            return flow.Cancellations.REJECTED;
        }
        
        const wt = new WorkerTask(this, task);
        
        const id = setTimeout(wt.run, 0);
        this.mTasks.push(id);
        wt.id = id;
        
        return wt;
    }

    scheduleDelayed(task: () => void, delay: number) : flow.Cancellation {
        if (this.mShutdown) {
            return flow.Cancellations.REJECTED;
        }
        
        const wt = new WorkerTask(this, task);
        
        const id = setTimeout(wt.run, delay);
        this.mTasks.push(id);
        wt.id = id;
        
        return wt;
    }
    
    schedulePeriodic(task: () => void, initialDelay: number, period: number) : flow.Cancellation {
        if (this.mShutdown) {
            return flow.Cancellations.REJECTED;
        }

        const wt = new WorkerPeriodicTask(this, task);
        
        const initialId = setTimeout(() => {
            this.remove(wt.initialId);
            wt.initialId = undefined;

            task();
            
            const periodId = setInterval(wt.run, period);
            this.mTasks.push(periodId);
            wt.periodId = periodId;
            
        }, initialDelay);
        this.mTasks.push(initialId);
        wt.initialId = initialId;
        
        return wt;        
    }
    
    shutdown() : void {
        this.mShutdown = true;
        for (var n of this.mTasks) {
            clearTimeout(n);
        }
        this.mTasks.length = 0;
    }
    
    remove(id: number) : void {
        const idx = this.mTasks.indexOf(id);
        if (idx >= 0) {
            this.mTasks.splice(idx, 1);
        }
    }
}

class WorkerTask implements flow.Cancellation {
    id: number;
    
    private mParent : DefaultWorker;
    
    private mTask : () => void;
    
    constructor(parent: DefaultWorker, task: () => void) {
        this.mParent = parent;
        this.mTask = task;
    }
    
    run() : void {
        try {
            this.mTask();
        } finally {
            this.mParent.remove(this.id);
        }
    }
    
    dispose() : void {
        clearTimeout(this.id);
        this.mParent.remove(this.id);
    }
}

class WorkerPeriodicTask implements flow.Cancellation {
    initialId: number;
    
    periodId: number;
    
    private mParent : DefaultWorker;
    
    private mTask : () => void;
    
    constructor(parent: DefaultWorker, task: () => void) {
        this.mParent = parent;
        this.mTask = task;
    }
    
    run() : void {
        try {
            this.mTask();
        } catch (ex) {
            console.log(ex);
            clearInterval(this.periodId);
            this.mParent.remove(this.periodId);
        }
    }
    
    dispose() : void {
        if (this.initialId !== undefined) {
            clearTimeout(this.initialId);
            this.mParent.remove(this.initialId);
            this.initialId = undefined;
        }
        if (this.periodId !== undefined) {
            clearInterval(this.periodId);
            this.mParent.remove(this.periodId);
            this.periodId = undefined;
        }
    }
}

class PeriodicTask implements flow.Cancellation {
    initialId: number;
    
    periodId: number;
    
    private mTask : () => void;
    
    constructor(task: () => void) {
        this.mTask = task;
    }
    
    run() : void {
        try {
            this.mTask();
        } catch (ex) {
            console.log(ex);
            clearInterval(this.periodId);
        }
    }
    
    dispose() : void {
        if (this.initialId !== undefined) {
            clearTimeout(this.initialId);
            this.initialId = undefined;
        }
        if (this.periodId !== undefined) {
            clearInterval(this.periodId);
            this.periodId = undefined;
        }
    }
}