import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as sch from './scheduler';
import * as flow from './flow';

export class DebounceTimedSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    
    private timer: flow.Cancellation = null;
    
    private s: rs.Subscription = null;
    
    private requested: number = 0;
    
    private done: boolean = false;
    
    constructor(private actual: rs.Subscriber<T>, private timeout: number, 
            private worker: sch.TimedWorker) {
        
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
            
            s.request(Infinity);
        }
    }
    
    onNext(t: T) : void {
        const at = this.timer;
        if (at != null) {
            at.dispose();
        }

        this.timer = this.worker.scheduleDelayed(() => {
            const r = this.requested;
            if (r != 0) {
                this.actual.onNext(t);
                if (r != Infinity) {
                    this.requested--;
                }
                if (this.done) {
                    this.actual.onComplete();
                    this.worker.shutdown();
                }
            } else {
                this.cancel();
                this.actual.onError(new Error("Could not emit value due to lack of requests"));
            }
            this.timer = null;
        }, this.timeout);      
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.worker.shutdown();
        this.actual.onError(t);
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        const at = this.timer;
        if (at == null) {
            this.actual.onComplete();
            this.worker.shutdown();
        }
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.requested += n;
        }
    }
    
    cancel() : void {
        this.s.cancel();
        this.worker.shutdown();
    }
}

export class SampleTimedSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    private s: rs.Subscription = null;
    
    private timer : flow.Cancellation = null;
    
    private value : Object = null;
    
    private requested: number = 0;
    
    constructor(private actual: rs.Subscriber<T>, private delay: number, private scheduler: sch.TimedScheduler) {
        
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.timer = this.scheduler.schedulePeriodic(() => this.take(), this.delay, this.delay);
            
            this.actual.onSubscribe(this);

            s.request(Infinity);
        }
    }
    
    take() : void {
        const v = this.value;
        if (v != null) {
            this.value = null;
            if (this.requested != 0) {
                this.actual.onNext(v as T);
                if (this.requested != Infinity) {
                    this.requested--;
                }
            } else {
                this.cancel();
                this.actual.onError(new Error("Could not emit value due to lack of requests"));
            }
        }
    }
    
    onNext(t: T) : void {
        this.value = t;
    }
    
    onError(t: Error) : void {
        this.timer.dispose();
        this.actual.onError(t);
    }
    
    onComplete() : void {
        this.timer.dispose();
        const v = this.value;
        if (v != null) {
            this.actual.onNext(v as T);
        }
        this.actual.onComplete();
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.requested += n;
        }
    }
    
    cancel() : void {
        this.s.cancel();
        this.timer.dispose();
    }
}

export class ThrottleFirstTimedSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    private s: rs.Subscription = null;
    
    private value: Object = null;
    
    private timer: flow.Cancellation = null;
    
    constructor(private actual: rs.Subscriber<T>, private timeout: number, private worker: sch.TimedWorker) {
        
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;

            this.actual.onSubscribe(this);
        }
    }
    
    onNext(t: T) : void {
        const v = this.value;
        if (v != null) {
            this.s.request(1);
        } else {
            this.value = t;
            this.actual.onNext(t);
            this.timer = this.worker.scheduleDelayed(() => {
                this.value = null;
                this.timer = null;
            }, this.timeout);
        }
    }
    
    onError(t: Error) : void {
        const at = this.timer;
        if (at != null) {
            at.dispose();
        }
        this.actual.onError(t);
    }
    
    onComplete() : void {
        const at = this.timer;
        if (at != null) {
            at.dispose();
        }
        this.actual.onComplete();        
    }
    
    request(n: number) : void {
        this.s.request(n);
    }
    
    cancel() : void {
        const at = this.timer;
        if (at != null) {
            at.dispose();
        }
        this.s.cancel();
    }
}