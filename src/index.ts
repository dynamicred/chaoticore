import * as fs from 'fs';
import * as path from 'path';
import Cryptr from 'cryptr';
import * as crypto from 'crypto';

function hashString(content:string):string {
	return crypto.createHash('sha256').update(content).digest('base64').split('/').join('').split('\\').join('');
}

function hashObject(content:any):string {
	return hashString(JSON.stringify(content));
}

type ObjectEncoderOptions = {
	storage:IObjectStorageManager;
	encoder:IDataEncoder;
	encrypter:IDataEncrypter;
}

class ObjectEncoder {
	storage:IObjectStorageManager;
	encoder:IDataEncoder;
	encrypter:IDataEncrypter;

	constructor(options:ObjectEncoderOptions) {
		this.storage = options.storage;
		this.encoder = options.encoder;
		this.encrypter = options.encrypter;
	}

	saveObject(content:any):string {
		const hash = hashObject(content);
		
		if (!this.storage.exists(hash)) {
			if (content instanceof Array) {
				const savedContent = {
					type:"array",
					content:[]
				} as {
					type:string;
					content:any[];
				};
				for (var i in content) {
					savedContent.content.push(this.saveObject(content[i]));
				}
				this.storage.write(hash,this.encrypter.encrypt(this.encoder.encode(savedContent)));
			} else if (typeof content == "object") {
				const savedContent = {
					type:"object",
					content:{}
				} as {
					type:string;
					content:Record<string,any>;
				};
				for (var i in content) {
					savedContent.content[i] = this.saveObject(content[i]);
				}
				this.storage.write(hash,this.encrypter.encrypt(this.encoder.encode(savedContent)));
			} else {
				this.storage.write(hash,this.encrypter.encrypt(this.encoder.encode({
					type:"native",
					content:content
				})));
			}
		}

		return hash;
	}

	deepLoadObject(hash:string):any {
		if (!this.storage.exists(hash)) {
			throw new Error("Object not found");
		}
		const content = this.encoder.decode(this.encrypter.decrypt(this.storage.read(hash)));
		let output:Record<string,any> = {};

		switch (content.type) {
			case "object":
				for (var i in content.content) {
					output[i] = this.deepLoadObject(content.content[i]);
				}
				break;
			case "array":
				const cn2 = content as {
					content:string[]
				};
				output = cn2.content.map((input)=>{return this.deepLoadObject(input)});
				break;
			case "native":
				output = content.content;
				break;
			default:
				throw new Error("DB Corrupted");
		}
		return output;
	}
}

interface IObjectStorageManager {
	exists(key: string): boolean;
	read(key: string): string;
	write(key: string, value: string): void;
}

type FileObjectStorageManagerOptions = {
	path: string;
};

class FileObjectStorageManager implements IObjectStorageManager {
	path: string;

	constructor(options: FileObjectStorageManagerOptions) {
		this.path = options.path;
	}

	exists(key: string) {
		return fs.existsSync(path.join(this.path, key));
	}

	read(key: string) {
		return fs.readFileSync(path.join(this.path, key)).toString();
	}
	write(key: string, value: string) {
		fs.mkdirSync(this.path,{
			recursive:true
		});
		fs.writeFileSync(path.join(this.path, key), value);
	}
}

interface IDataEncrypter {
	setKey(key: string): void;

	encrypt(input: string): string;
	decrypt(input: string): string;
}

class CryptrDataEncrypter implements IDataEncrypter {
	#cryptr?: Cryptr;

	get cryptr() {
		if (!this.#cryptr) {
			throw new Error('No Key');
		}
		return this.#cryptr;
	}

	constructor() {
		this.#cryptr = undefined;
	}

	setKey(key: string): void {
		this.#cryptr = new Cryptr(key);
	}

	encrypt(input: string): string {
		return this.cryptr.encrypt(input);
	}

	decrypt(input: string): string {
		return this.cryptr.decrypt(input);
	}
}

interface IDataEncoder {
	decode(content: string): any;
	encode(content: any): string;
}

class JSONDataEncoder {
	decode(content: string): any {
		return JSON.parse(content);
	}
	encode(content: any): string {
		return JSON.stringify(content);
	}
}

export {
	ObjectEncoder,
	IObjectStorageManager,
	IDataEncrypter,
	IDataEncoder,
	FileObjectStorageManager,
	CryptrDataEncrypter,
	JSONDataEncoder
};
