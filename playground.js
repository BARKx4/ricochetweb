/**
 * Ricochet Programming Language - Interactive VM & Playground
 * Spec-compliant concatenative (Forth-based) interpreter in JavaScript
 */

class RicochetResult {
    constructor(isOk, value, errorValue) {
        this.isOk = isOk;
        this.value = value;
        this.errorValue = errorValue;
        this.errorMessage = errorValue && typeof errorValue === 'object' ? errorValue.message : errorValue;
    }
}

class RicochetClass {
    constructor(name, parentName) {
        this.name = name;
        this.parentName = parentName;
        this.fields = new Set();
        this.methods = {};
        this.tableName = null;
    }
}

class RicochetObject {
    constructor(klass) {
        this.klass = klass;
        this.fields = {};
    }
}

class RicochetVM {
    constructor() {
        this.reset();
    }

    reset() {
        this.dataStack = [];
        this.callStack = [];
        this.variables = {};
        
        // Classes dictionary
        this.classes = {
            'Model': new RicochetClass('Model', null)
        };
        
        // Compiler State
        this.compilingClass = null; // Class currently being defined
        this.compilingMethodName = null;
        this.compilingMethodBody = [];
        this.compilingMethodNest = 0;

        // VM State
        this.tokens = [];
        this.currentTokens = [];
        this.ip = 0;
        this.jumps = {}; // Jump table for control flow
        this.output = '';
        this.error = null;
        this.isFinished = false;
        this.stepsCount = 0;
        this.maxSteps = 5000;

        this.initializeVocabulary();
    }

    initializeVocabulary() {
        this.dictionary = {};

        // Built-in math primitives
        this.dictionary['+'] = () => this.binaryOp((a, b) => a + b);
        this.dictionary['-'] = () => this.binaryOp((a, b) => a - b);
        this.dictionary['*'] = () => this.binaryOp((a, b) => a * b);
        this.dictionary['/'] = () => this.binaryOp((a, b) => {
            if (b === 0) throw new Error("Division by zero");
            return Math.floor(a / b);
        });
        this.dictionary['mod'] = () => this.binaryOp((a, b) => {
            if (b === 0) throw new Error("Modulo by zero");
            return a % b;
        });

        // Comparisons
        this.dictionary['='] = () => this.binaryOp((a, b) => a === b ? 1 : 0);
        this.dictionary['==='] = () => this.binaryOp((a, b) => a === b ? 1 : 0);
        this.dictionary['equals'] = () => this.binaryOp((a, b) => a === b ? 1 : 0);
        this.dictionary['identical'] = () => this.binaryOp((a, b) => a === b ? 1 : 0);
        this.dictionary['<'] = () => this.binaryOp((a, b) => a < b ? 1 : 0);
        this.dictionary['>'] = () => this.binaryOp((a, b) => a > b ? 1 : 0);
        this.dictionary['<='] = () => this.binaryOp((a, b) => a <= b ? 1 : 0);
        this.dictionary['>='] = () => this.binaryOp((a, b) => a >= b ? 1 : 0);
        this.dictionary['<>'] = () => this.binaryOp((a, b) => a !== b ? 1 : 0);

        // Core stack manipulation
        this.dictionary['dup'] = () => {
            if (this.dataStack.length < 1) throw new Error("Stack underflow (dup)");
            this.push(this.dataStack[this.dataStack.length - 1]);
        };
        this.dictionary['drop'] = () => {
            if (this.dataStack.length < 1) throw new Error("Stack underflow (drop)");
            this.pop();
        };
        this.dictionary['swap'] = () => {
            if (this.dataStack.length < 2) throw new Error("Stack underflow (swap)");
            const b = this.pop();
            const a = this.pop();
            this.push(b);
            this.push(a);
        };
        this.dictionary['over'] = () => {
            if (this.dataStack.length < 2) throw new Error("Stack underflow (over)");
            this.push(this.dataStack[this.dataStack.length - 2]);
        };
        this.dictionary['rot'] = () => {
            if (this.dataStack.length < 3) throw new Error("Stack underflow (rot)");
            const c = this.pop();
            const b = this.pop();
            const a = this.pop();
            this.push(b);
            this.push(c);
            this.push(a);
        };

        // Output and formatting
        this.dictionary['print'] = () => {
            if (this.dataStack.length < 1) throw new Error("Stack underflow (print)");
            const val = this.pop();
            this.print(val === null || val === undefined ? "nil" : val);
        };
        this.dictionary['println'] = () => {
            if (this.dataStack.length < 1) throw new Error("Stack underflow (println)");
            const val = this.pop();
            this.print((val === null || val === undefined ? "nil" : val) + "\n");
        };
        this.dictionary['emit'] = () => {
            if (this.dataStack.length < 1) throw new Error("Stack underflow (emit)");
            this.print(String.fromCharCode(this.pop()));
        };
        this.dictionary['.s'] = () => {
            this.print(`<${this.dataStack.length}> [ ` + this.dataStack.map(v => v instanceof RicochetObject ? `<object:${v.klass.name}>` : v).join(' ') + ' ]\n');
        };

        // Spec Predicates
        this.dictionary['nil?'] = () => {
            const val = this.pop();
            this.push((val === 'nil' || val === null || val === undefined) ? 1 : 0);
        };
        this.dictionary['empty?'] = () => {
            const val = this.pop();
            const isEmpty = (val === 'nil' || val === '' || val === null || val === undefined || (Array.isArray(val) && val.length === 0));
            this.push(isEmpty ? 1 : 0);
        };
        this.dictionary['ok?'] = () => {
            const val = this.pop();
            if (val instanceof RicochetResult) {
                this.push(val.isOk ? 1 : 0);
            } else {
                this.push((val !== 'nil' && val !== null && val !== undefined && val !== 0 && val !== false) ? 1 : 0);
            }
        };

        // Result constructor & attributes
        this.dictionary['ok'] = () => {
            const val = this.pop();
            this.push(new RicochetResult(true, val, null));
        };
        this.dictionary['fail'] = () => {
            const message = this.pop();
            const kind = this.pop();
            this.push(new RicochetResult(false, null, { kind, message }));
        };
        this.dictionary['new-result'] = () => {
            const errorMsg = this.pop();
            const isOk = this.pop();
            const val = this.pop();
            this.push(new RicochetResult(isOk === 1 || isOk === true, val, errorMsg));
        };
        this.dictionary['value'] = () => {
            const res = this.pop();
            if (!(res instanceof RicochetResult)) throw new Error("Expected Result object (value)");
            this.push(res.value);
        };
        this.dictionary['error'] = () => {
            const res = this.pop();
            if (!(res instanceof RicochetResult)) throw new Error("Expected Result object (error)");
            this.push(res.errorValue || { message: res.errorMessage || 'nil' });
        };

        // Variables primitives
        this.dictionary['var'] = () => {
            const varName = this.pop();
            if (typeof varName !== 'string') throw new Error("Variable declaration requires a symbol/name");
            const initialValue = this.dataStack.length > 0 ? this.pop() : 'nil';
            this.variables[varName] = initialValue;
            
            // Add variable word to dictionary, which pushes its name symbol when executed
            this.dictionary[varName] = () => {
                this.push(varName);
            };
        };

        this.dictionary['get'] = () => {
            const sym = this.pop();
            if (this.dataStack.length > 0 && (this.dataStack[this.dataStack.length - 1] instanceof RicochetObject)) {
                // Object Field Get
                const obj = this.pop();
                const cleanSym = sym.startsWith('.') ? sym.substring(1) : sym;
                this.push(this.getField(obj, cleanSym));
            } else {
                // Variable Get
                if (typeof sym !== 'string') throw new Error("Variable get requires a symbol");
                if (!(sym in this.variables)) throw new Error(`Undefined variable: "${sym}"`);
                this.push(this.variables[sym]);
            }
        };

        this.dictionary['set'] = () => {
            const sym = this.pop();
            if (this.dataStack.length > 1 && (this.dataStack[this.dataStack.length - 1] instanceof RicochetObject)) {
                // Object Field Set
                const obj = this.pop();
                const val = this.pop();
                const cleanSym = sym.startsWith('.') ? sym.substring(1) : sym;
                this.setField(obj, cleanSym, val);
            } else {
                // Variable Set
                const val = this.pop();
                if (typeof sym !== 'string') throw new Error("Variable set requires a symbol");
                if (!(sym in this.variables)) throw new Error(`Variable "${sym}" must be declared with var first`);
                this.variables[sym] = val;
            }
        };

        this.dictionary['at'] = () => {
            const key = this.pop();
            const container = this.pop();
            if (container === null || container === undefined || container === 'nil') {
                this.push('nil');
                return;
            }
            if (Array.isArray(container)) {
                this.push(container[Number(key)] ?? 'nil');
                return;
            }
            if (typeof container === 'object') {
                this.push(Object.prototype.hasOwnProperty.call(container, key) ? container[key] : 'nil');
                return;
            }
            throw new Error("at requires a map, object, or array");
        };

        // OOP subclass and definition primitives
        this.dictionary['subclass'] = () => {
            const parentName = this.pop();
            const className = this.pop();
            if (typeof className !== 'string' || typeof parentName !== 'string') {
                throw new Error("subclass requires class name and parent class name symbols");
            }
            if (!(parentName in this.classes)) throw new Error(`Unknown parent class: "${parentName}"`);
            
            const newKlass = new RicochetClass(className, parentName);
            this.classes[className] = newKlass;
            
            // Add class symbol execution
            this.dictionary[className] = () => {
                this.push(className);
            };

            this.compilingClass = newKlass;
        };

        this.dictionary['open-class'] = () => {
            const className = this.pop();
            if (typeof className !== 'string') throw new Error("open-class requires class name symbol");
            if (!(className in this.classes)) throw new Error(`Class "${className}" does not exist`);
            this.compilingClass = this.classes[className];
        };

        this.dictionary['table'] = () => {
            const tableName = this.pop();
            if (!this.compilingClass) throw new Error("table mapping used outside class declaration");
            this.compilingClass.tableName = tableName;
        };

        this.dictionary['field'] = () => {
            const fieldName = this.pop();
            if (!this.compilingClass) throw new Error("field declaration used outside class declaration");
            this.compilingClass.fields.add(fieldName);
        };

        this.dictionary['accessor'] = () => {
            const fieldName = this.pop();
            if (!this.compilingClass) throw new Error("Accessor declaration used outside class declaration");
            this.compilingClass.fields.add(fieldName);
            
            // Generate getter method: fieldName.get
            const getterName = `${fieldName}.get`;
            this.compilingClass.methods[getterName] = {
                name: getterName,
                body: ['self', `"${fieldName}"`, 'get'],
                jumps: {}
            };
            
            // Generate setter method: fieldName.set
            const setterName = `${fieldName}.set`;
            this.compilingClass.methods[setterName] = {
                name: setterName,
                body: ['self', `"${fieldName}"`, 'set', 'self'],
                jumps: {}
            };
        };

        this.dictionary['method'] = () => {
            const methodName = this.pop();
            if (!this.compilingClass) throw new Error("Method declaration used outside class declaration");
            
            // Check if top of stack is a block (array of tokens)
            if (this.dataStack.length >= 1 && Array.isArray(this.dataStack[this.dataStack.length - 1])) {
                const block = this.pop();
                this.compilingClass.methods[methodName] = {
                    name: methodName,
                    body: block,
                    jumps: this.compileBlock(block)
                };
            } else {
                // Fallback to old compilation block mode
                this.compilingMethodName = methodName;
                this.compilingMethodBody = [];
                this.compilingMethodNest = 0;
            }
        };

        this.dictionary['new'] = () => {
            const className = this.pop();
            if (!(className in this.classes)) throw new Error(`Class "${className}" not found`);
            const obj = new RicochetObject(this.classes[className]);
            
            // Gather all fields in inheritance chain
            let k = obj.klass;
            while (k) {
                for (let f of k.fields) {
                    if (!(f in obj.fields)) {
                        obj.fields[f] = 'nil';
                    }
                }
                k = k.parentName ? this.classes[k.parentName] : null;
            }

            this.push(obj);
        };

        // System Constants
        this.dictionary['nil'] = () => this.push('nil');
        this.dictionary['false'] = () => this.push(0);
        this.dictionary['true'] = () => this.push(1);
        this.dictionary['self'] = () => {
            if (!('self' in this.variables)) throw new Error("self is only available inside method context");
            this.push(this.variables['self']);
        };
    }

    push(val) {
        if (this.dataStack.length >= 100) throw new Error("Stack overflow");
        this.dataStack.push(val);
    }

    pop() {
        if (this.dataStack.length === 0) throw new Error("Stack underflow");
        return this.dataStack.pop();
    }

    binaryOp(op) {
        if (this.dataStack.length < 2) throw new Error("Stack underflow");
        const b = this.pop();
        const a = this.pop();
        this.push(op(a, b));
    }

    print(text) {
        this.output += text;
    }

    getField(obj, fieldName) {
        if (!(fieldName in obj.fields)) {
            // Check if it exists in inheritance fields but not initialized
            return 'nil';
        }
        return obj.fields[fieldName];
    }

    setField(obj, fieldName, value) {
        obj.fields[fieldName] = value;
    }

    // Static Control Flow Jump compiler
    compileBlock(tokens) {
        let jumps = {};
        let stack = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i].toLowerCase();
            if (token === 'if') {
                stack.push({ type: 'if', index: i });
            } else if (token === 'while') {
                // Find statement boundary condition start
                let condStart = 0;
                for (let j = i - 1; j >= 0; j--) {
                    const prev = tokens[j].toLowerCase();
                    if (prev === 'end' || prev === ';' || prev === 'else' || 
                        prev === 'set' || prev === 'var' || prev === 'print' || 
                        prev === 'println' || prev === 'subclass' || prev === 'field' || 
                        prev === 'method' || prev === 'table') {
                        condStart = j + 1;
                        break;
                    }
                }
                stack.push({ type: 'while', index: i, condStart: condStart });
            } else if (token === 'else') {
                const top = stack[stack.length - 1];
                if (top && top.type === 'if') {
                    jumps[top.index] = i + 1; // if jumps to else body
                    stack.pop();
                    stack.push({ type: 'else', index: i });
                } else {
                    throw new Error("Else without matching If");
                }
            } else if (token === 'end') {
                const top = stack.pop();
                if (!top) {
                    // This end is closing method/class definition, which is compiled in step()
                    continue;
                }
                if (top.type === 'if') {
                    jumps[top.index] = i + 1; // if jumps past end
                } else if (top.type === 'else') {
                    jumps[top.index] = i + 1; // else jumps past end
                } else if (top.type === 'while') {
                    jumps[top.index] = i + 1; // while false jumps past end
                    jumps[i] = top.condStart; // end loops back to condition start
                }
            }
        }
        return jumps;
    }

    load(code) {
        this.reset();
        
        // Strip custom (( ... )) comments (including multiline)
        const commentFree = code.replace(/\(\([\s\S]*?\)\)/g, ' ');
        
        // Parse strings and normal tokens
        // Let's implement a quick token scanner that keeps quotes together
        const tokens = [];
        let i = 0;
        while (i < commentFree.length) {
            const char = commentFree[i];
            if (/\s/.test(char)) {
                i++;
                continue;
            }
            if (char === '"') {
                // Read string literal
                let str = '';
                i++; // skip open quote
                while (i < commentFree.length && commentFree[i] !== '"') {
                    str += commentFree[i];
                    i++;
                }
                i++; // skip close quote
                tokens.push(`"${str}"`);
            } else {
                // Read word
                let word = '';
                while (i < commentFree.length && !/\s/.test(commentFree[i])) {
                    word += commentFree[i];
                    i++;
                }
                tokens.push(word);
            }
        }

        this.tokens = tokens;
        this.currentTokens = this.tokens;
        this.jumps = this.compileBlock(this.tokens);
        this.ip = 0;
        this.isFinished = this.tokens.length === 0;
    }

    step() {
        if (this.isFinished || this.error) return;

        this.stepsCount++;
        if (this.stepsCount > this.maxSteps) {
            this.error = "Execution limit reached (possible infinite loop)";
            return;
        }

        if (this.ip >= this.currentTokens.length) {
            if (this.callStack.length > 0) {
                const frame = this.callStack.pop();
                this.currentTokens = frame.tokens;
                this.jumps = frame.jumps;
                this.ip = frame.ip;
                // Restore variables scope if we had local variables
                if (frame.variables) {
                    this.variables = frame.variables;
                }
                return;
            } else {
                this.isFinished = true;
                return;
            }
        }

        const token = this.currentTokens[this.ip];
        const lowerToken = token.toLowerCase();

        try {
            // Quotation block parse: [ ... ]
            if (token === '[') {
                let nest = 1;
                let start = this.ip + 1;
                let end = start;
                while (end < this.currentTokens.length) {
                    const t = this.currentTokens[end];
                    if (t === '[') nest++;
                    if (t === ']') {
                        nest--;
                        if (nest === 0) break;
                    }
                    end++;
                }
                if (nest > 0) {
                    throw new Error("Mismatched '[' in code");
                }
                const blockTokens = this.currentTokens.slice(start, end);
                this.push(blockTokens);
                this.ip = end + 1; // skip past ']'
                return;
            }
            // A. If compiling a method body inside class subclass ... end
            if (this.compilingMethodName) {
                if (lowerToken === 'if' || lowerToken === 'while') {
                    this.compilingMethodNest++;
                }
                
                if (lowerToken === 'end') {
                    if (this.compilingMethodNest > 0) {
                        this.compilingMethodNest--;
                        this.compilingMethodBody.push(token);
                    } else {
                        // Semicolon/End closes the method
                        this.compilingClass.methods[this.compilingMethodName] = {
                            name: this.compilingMethodName,
                            body: [...this.compilingMethodBody],
                            jumps: this.compileBlock(this.compilingMethodBody)
                        };
                        this.compilingMethodName = null;
                        this.compilingMethodBody = [];
                    }
                } else {
                    this.compilingMethodBody.push(token);
                }
                this.ip++;
                return;
            }

            // B. If compiling class subclass ... end
            if (this.compilingClass) {
                if (lowerToken === 'end') {
                    this.compilingClass = null;
                } else {
                    // Run declarations immediately
                    const word = this.dictionary[lowerToken];
                    if (word) {
                        word();
                    } else {
                        // Treat as bare name static symbol
                        const num = Number(token);
                        if (!isNaN(num) && token !== '') {
                            this.push(num);
                        } else if (token.startsWith('"') && token.endsWith('"')) {
                            this.push(token.substring(1, token.length - 1));
                        } else {
                            this.push(token);
                        }
                    }
                }
                this.ip++;
                return;
            }

            // C. Normal Execution
            // 0. Variable references starting with $
            if (token.startsWith('$') && token.length > 1) {
                const varName = token.substring(1);
                const nextToken = this.ip + 1 < this.currentTokens.length ? this.currentTokens[this.ip + 1].toLowerCase() : '';
                if (nextToken === 'set' || nextToken === 'var') {
                    // Push the clean name symbol for assignment/declaration
                    this.push(varName);
                } else {
                    // Automatically get the variable's value
                    if (!(varName in this.variables)) {
                        throw new Error(`Undefined variable: "${varName}"`);
                    }
                    this.push(this.variables[varName]);
                }
                this.ip++;
                return;
            }

            // 1. Literal strings
            if (token.startsWith('"') && token.endsWith('"')) {
                this.push(token.substring(1, token.length - 1));
                this.ip++;
                return;
            }

            // 2. Numbers
            const num = Number(token);
            if (!isNaN(num) && token !== '') {
                this.push(num);
                this.ip++;
                return;
            }

            // 3. Conditionals (if ... else ... end)
            if (lowerToken === 'if') {
                const val = this.pop();
                const isFalsey = (val === 0 || val === 'nil' || val === false || val === null || val === undefined || val === '');
                if (isFalsey) {
                    if (this.jumps[this.ip]) {
                        this.ip = this.jumps[this.ip];
                    } else {
                        throw new Error("Missing matching else or end for if");
                    }
                } else {
                    this.ip++;
                }
                return;
            }

            if (lowerToken === 'else') {
                if (this.jumps[this.ip]) {
                    this.ip = this.jumps[this.ip];
                } else {
                    throw new Error("Missing end for else");
                }
                return;
            }

            if (lowerToken === 'end') {
                if (this.jumps[this.ip] !== undefined) {
                    this.ip = this.jumps[this.ip]; // loops back for while loops
                } else {
                    this.ip++;
                }
                return;
            }

            // 4. While loop check
            if (lowerToken === 'while') {
                const val = this.pop();
                const isFalsey = (val === 0 || val === 'nil' || val === false || val === null || val === undefined || val === '');
                if (isFalsey) {
                    if (this.jumps[this.ip]) {
                        this.ip = this.jumps[this.ip];
                    } else {
                        throw new Error("Missing matching end for while");
                    }
                } else {
                    this.ip++;
                }
                return;
            }

            // 5. Special dot method call syntax or auto field lookup (.displayName)
            if (token.startsWith('.') && token.length > 1) {
                const nextToken = this.ip + 1 < this.currentTokens.length ? this.currentTokens[this.ip + 1].toLowerCase() : '';
                if (nextToken === 'get' || nextToken === 'set') {
                    // Pushes field symbol (backwards compatibility)
                    this.push(token);
                    this.ip++;
                } else {
                    // Method dispatch or auto-get field lookup
                    const memberName = token.substring(1);
                    if (this.dataStack.length < 1) throw new Error(`Stack underflow (member lookup ${token})`);
                    
                    const receiver = this.dataStack[this.dataStack.length - 1]; // peek receiver
                    
                    // Handle special error message property lookup
                    if (receiver instanceof RicochetResult && memberName === 'message') {
                        this.pop(); // pop receiver
                        this.push(receiver.errorMessage || 'nil');
                        this.ip++;
                        return;
                    }

                    if (receiver instanceof RicochetObject) {
                        // Resolve method
                        let method = null;
                        let k = receiver.klass;
                        while (k) {
                            if (k.methods[memberName]) {
                                method = k.methods[memberName];
                                break;
                            }
                            k = k.parentName ? this.classes[k.parentName] : null;
                        }

                        if (method) {
                            // Save stack frame and execute method
                            const savedVars = {...this.variables};
                            this.callStack.push({
                                tokens: this.currentTokens,
                                jumps: this.jumps,
                                ip: this.ip + 1,
                                variables: savedVars
                            });

                            // Set up local scope
                            this.variables = {
                                'self': receiver
                            };
                            
                            // Bind method execution
                            this.currentTokens = method.body;
                            this.jumps = method.jumps;
                            this.ip = 0;
                        } else {
                            // Automatic field get!
                            this.pop(); // pop receiver
                            this.push(this.getField(receiver, memberName));
                            this.ip++;
                        }
                    } else {
                        throw new Error(`Member lookup ${token} requires object or result receiver, got: ${typeof receiver}`);
                    }
                }
                return;
            }

            // 6. Dictionary words
            const word = this.dictionary[token] || this.dictionary[lowerToken];
            if (word) {
                word();
                this.ip++;
                return;
            }

            // 6b. Unknown token - check if it is a method call on the top object
            if (this.dataStack.length >= 1) {
                const receiver = this.dataStack[this.dataStack.length - 1];
                if (receiver instanceof RicochetObject) {
                    const memberName = token;
                    let method = null;
                    let k = receiver.klass;
                    while (k) {
                        if (k.methods[memberName]) {
                            method = k.methods[memberName];
                            break;
                        }
                        k = k.parentName ? this.classes[k.parentName] : null;
                    }
                    if (method) {
                        // Pop receiver
                        this.pop();
                        // Save stack frame and execute method
                        const savedVars = {...this.variables};
                        this.callStack.push({
                            tokens: this.currentTokens,
                            jumps: this.jumps,
                            ip: this.ip + 1,
                            variables: savedVars
                        });

                        // Set up local scope
                        this.variables = {
                            'self': receiver
                        };
                        
                        // Bind method execution
                        this.currentTokens = method.body;
                        this.jumps = method.jumps;
                        this.ip = 0;
                        return;
                    }
                }
            }

            // 7. Unknown token - treat as bare static symbol by pushing it
            this.push(token);
            this.ip++;

        } catch (err) {
            this.error = err.message;
            this.isFinished = true;
        }
    }

    runAll() {
        while (!this.isFinished && !this.error) {
            this.step();
        }
    }
}

// ==========================================
// Playground UI Manager
// ==========================================

const EXAMPLES = {
    subclass: `(( Define User subclass mapping schema ))
User Model Subclass
  "email" Accessor
  "name" Accessor

  [
    self name.get nil? if
      self email.get
    else
      self name.get
    end
  ] "displayName" Method
end

(( Instantiate new User ))
User new user var
"Alice" $user name.set user set
"alice@example.com" $user email.set user set

(( Call displayName method ))
"User Account Display Name:" println
$user displayName println
`,

    variables: `(( Variables setup and mutation ))
amount var
100 amount set

(( Add 50 and update ))
$amount 50 + amount set

"Variable value: " print
$amount println
`,

    fibonacci: `(( Fibonacci loop using while ... end ))
limit var
a var
b var
temp var

10 limit set
0 a set
1 b set

"Fibonacci Sequence:" println
$limit 0 > while
  $a print " " print
  
  $a $b + temp set
  $b a set
  $temp b set
  
  $limit 1 - limit set
end
"" println
`,

    factorial: `(( Compute Factorial using while ))
n var
result var

6 n set
1 result set

$n 1 > while
  $result $n * result set
  $n 1 - n set
end

"Factorial of 6 is: " print
$result println
`,

    result: `(( expected failure Result testing ))
"Auth" "Invalid credentials" fail result var

$result ok? if
  "Success: " print $result value println
else
  "Failed: " print $result error "message" at println
end
`
};

document.addEventListener("DOMContentLoaded", () => {
    const editor = document.getElementById("editor");
    const runBtn = document.getElementById("run-btn");
    const stepBtn = document.getElementById("step-btn");
    const resetBtn = document.getElementById("reset-btn");
    const exampleSelect = document.getElementById("example-select");
    const stackContainer = document.getElementById("stack-container");
    const consoleOutput = document.getElementById("console-output");
    const vmStatus = document.getElementById("vm-status");
    const definedWordsContainer = document.getElementById("defined-words");
    const tokenTraceContainer = document.getElementById("token-trace");

    const vm = new RicochetVM();
    let stepInterval = null;
    let traceTokens = [];

    // Load example
    const loadExample = (key) => {
        if (EXAMPLES[key]) {
            editor.value = EXAMPLES[key];
            resetUI();
        }
    };

    exampleSelect.addEventListener("change", (e) => {
        loadExample(e.target.value);
    });

    // Reset UI and VM
    const resetUI = () => {
        clearInterval(stepInterval);
        stepInterval = null;
        vm.reset();
        traceTokens = [];
        
        stackContainer.innerHTML = '<div class="empty-stack-msg">Stack is empty</div>';
        consoleOutput.textContent = '';
        vmStatus.textContent = 'Ready';
        vmStatus.className = 'status-tag ready';
        tokenTraceContainer.innerHTML = '<span class="trace-empty">Code trace will appear here</span>';
        
        updateDefinedWords();
    };

    resetBtn.addEventListener("click", resetUI);

    // Update the visual representation of the stack
    const updateStackUI = () => {
        if (vm.dataStack.length === 0) {
            stackContainer.innerHTML = '<div class="empty-stack-msg">Stack is empty</div>';
            return;
        }

        let html = '';
        for (let i = vm.dataStack.length - 1; i >= 0; i--) {
            let val = vm.dataStack[i];
            let displayVal = val;
            
            if (val instanceof RicochetObject) {
                displayVal = `<span class="object-badge">${val.klass.name} obj</span>`;
            } else if (val instanceof RicochetResult) {
                displayVal = `<span class="result-badge">${val.isOk ? 'Ok' : 'Err'}</span>`;
            } else if (typeof val === 'string') {
                displayVal = `"${val}"`;
            }
            
            const isTop = i === vm.dataStack.length - 1;
            html += `
                <div class="stack-item ${isTop ? 'top-item' : ''}" style="animation: popIn 0.2s ease-out">
                    <span class="stack-index">S[${i}]</span>
                    <span class="stack-value">${displayVal}</span>
                    ${isTop ? '<span class="stack-label">TOP</span>' : ''}
                </div>
            `;
        }
        stackContainer.innerHTML = html;
    };

    // Update console output
    const updateConsoleUI = () => {
        consoleOutput.textContent = vm.output || "No console output yet.";
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    };

    // Update defined classes/words list
    const updateDefinedWords = () => {
        const classes = Object.keys(vm.classes).filter(c => c !== 'Model');
        const vars = Object.keys(vm.variables);
        
        let html = '';
        if (classes.length > 0) {
            html += `<div style="margin-bottom: 8px;"><div class="trace-label">Classes:</div>`;
            html += classes.map(c => `<span class="custom-word" title="Subclass of ${vm.classes[c].parentName}">${c}</span>`).join(' ');
            html += `</div>`;
        }
        if (vars.length > 0) {
            html += `<div><div class="trace-label">Variables:</div>`;
            html += vars.map(v => `<span class="custom-word" style="background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.3); color: #93c5fd;">${v}</span>`).join(' ');
            html += `</div>`;
        }
        
        if (classes.length === 0 && vars.length === 0) {
            definedWordsContainer.innerHTML = '<span class="no-words">No classes or variables defined.</span>';
        } else {
            definedWordsContainer.innerHTML = html;
        }
    };

    // Display the code trace highlighting current token
    const updateTraceUI = () => {
        if (vm.tokens.length === 0) {
            tokenTraceContainer.innerHTML = '<span class="trace-empty">No instructions loaded</span>';
            return;
        }

        let traceHtml = vm.currentTokens.map((t, idx) => {
            const isActive = idx === vm.ip;
            return `<span class="trace-token ${isActive ? 'active-token' : ''}">${t}</span>`;
        }).join(' ');

        if (vm.callStack.length > 0) {
            traceHtml = `
                <div class="trace-section">
                    <div class="trace-label">Current Context Frame:</div>
                    <div class="trace-tokens">
                        ${vm.currentTokens.map((t, idx) => {
                            const isActive = idx === vm.ip;
                            return `<span class="trace-token ${isActive ? 'active-token' : ''}">${t}</span>`;
                        }).join(' ')}
                    </div>
                </div>
            `;
        }

        tokenTraceContainer.innerHTML = traceHtml;
    };

    const updateStatusUI = () => {
        if (vm.error) {
            vmStatus.textContent = 'Error';
            vmStatus.className = 'status-tag error';
            consoleOutput.textContent += `\n[Error] ${vm.error}`;
        } else if (vm.isFinished) {
            vmStatus.textContent = 'Finished';
            vmStatus.className = 'status-tag finished';
        } else if (vm.ip > 0 || vm.callStack.length > 0) {
            vmStatus.textContent = 'Running';
            vmStatus.className = 'status-tag running';
        } else {
            vmStatus.textContent = 'Loaded';
            vmStatus.className = 'status-tag ready';
        }
    };

    const runSingleStep = () => {
        if (vm.isFinished || vm.error) {
            clearInterval(stepInterval);
            stepInterval = null;
            updateStatusUI();
            return;
        }

        vm.step();
        updateStackUI();
        updateConsoleUI();
        updateTraceUI();
        updateDefinedWords();
        updateStatusUI();
    };

    // Run Button Action
    runBtn.addEventListener("click", () => {
        resetUI();
        const code = editor.value;
        vm.load(code);
        updateTraceUI();
        updateStatusUI();

        vm.runAll();

        updateStackUI();
        updateConsoleUI();
        updateDefinedWords();
        updateStatusUI();
        updateTraceUI();
    });

    // Step Button Action
    stepBtn.addEventListener("click", () => {
        if (vm.ip === 0 && vm.stepsCount === 0 && !vm.isFinished && !vm.error) {
            const code = editor.value;
            vm.load(code);
            updateTraceUI();
            updateStatusUI();
        }
        runSingleStep();
    });

    // Initialize
    loadExample("subclass");
});
