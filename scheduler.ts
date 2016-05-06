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


export class DefaultScheduler implements Scheduler {
    schedule(task: () => void) : flow.Cancellation {
        const id = setTimeout(task, 0);
        return new flow.CallbackCancellation(() => clearTimeout(id));
    }
    
    createWorker() : Worker {
        throw new Error("unsupported right now");
    }
}