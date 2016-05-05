import * as rs from "./reactivestreams-spec";
import * as flow from "./flow";
import * as range from "./flux-range";
import * as solo from "./flux-solo";
import * as map from "./flux-map";
import * as subscriber from "./subscriber";

export abstract class Flux<T> implements rs.Publisher<T> {
    
    abstract subscribe(s: rs.Subscriber<T>) : void;
    
    static range(start: number, count: number) : Flux<number> {
        return new range.FluxRange(start, count);
    }
    
    static never<T>() : Flux<T> {
        return solo.FluxNever.INSTANCE;
    }

    static empty<T>() : Flux<T> {
        return solo.FluxEmpty.INSTANCE;
    }
    
    static just<T>(t: T) : Flux<T> {
        if (t == null) {
            throw new Error("t is null");
        }
        return new solo.FluxJust<T>(t);
    }
    
    // ------------------------------------
    
    map<R>(mapper: (t: T) => R) {
        return new map.FluxMap<T, R>(this, mapper);
    }
    
    // ------------------------------------
    
    consume(onNext : (t: T) => void, onError? : (t : Error) => void, onComplete? : () => void) : flow.Cancellation {
        const cs = new subscriber.CallbackSubscriber(
            onNext, 
            onError === undefined ? (t: Error) : void => { console.log(t); } : onError,
            onComplete === undefined ? () : void => { } : onComplete);
        this.subscribe(cs);
        return cs;
    }

}