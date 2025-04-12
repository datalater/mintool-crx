class RefImpl {
  _value;

  constructor(value) {
    this._value = value;
  }

  get value() {
    vueMin._track(this, "value");
    return this._value;
  }

  set value(newValue) {
    const oldValue = this._value;

    if (oldValue === newValue) return;

    this._value = newValue;

    vueMin._trigger(this, "value");
  }
}

const vueMin = {
  _activeEffect: null,
  _allTargetDeps: new WeakMap(),

  ref: function ref(value) {
    return new RefImpl(value);
  },

  watch: function watch(source, callback) {
    const isSourceFunction = typeof source === "function";
    const isSourceRef = source instanceof RefImpl;

    if (isSourceRef) {
      this.effect(() => {
        callback(source.value);
      });
      return;
    }

    if (isSourceFunction) {
      this.effect(() => {
        callback(source());
      });
      return;
    }

    throw new TypeError(
      "watch source must be a ref or a getter function\nwe got: " +
        source +
        " (" +
        typeof source +
        ")"
    );
  },

  effect: function effect(fn) {
    this._activeEffect = fn;
    fn();
    this._activeEffect = null;
  },

  _track: function track(target, key) {
    let targetDeps = this._allTargetDeps.get(target);
    if (!targetDeps) {
      targetDeps = new Map();
      this._allTargetDeps.set(target, targetDeps);
    }

    let targetValueEffects = targetDeps.get(key);
    if (!targetValueEffects) {
      targetValueEffects = new Set();
      targetDeps.set(key, targetValueEffects);
    }

    this._activeEffect && targetValueEffects.add(this._activeEffect);
  },

  _trigger: function trigger(target, key) {
    const targetDeps = this._allTargetDeps.get(target);
    if (!targetDeps) return;

    const targetValueEffects = targetDeps.get(key);
    if (!targetValueEffects) return;

    targetValueEffects.forEach((effect) => effect());
  },
};

vueMin.watch = vueMin.watch.bind(vueMin);
vueMin.effect = vueMin.effect.bind(vueMin);
