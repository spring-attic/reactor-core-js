import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as sch from './scheduler';
import * as flow from './flow';

export class DebounceSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    
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
            this.actual.onNext(t);
            if (this.done) {
                this.actual.onComplete();
                this.worker.shutdown();
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