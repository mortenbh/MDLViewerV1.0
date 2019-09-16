function BinaryFileReader(url) {
	var req = new XMLHttpRequest();

	// synchronous
	req.open('GET', url, false);

	// force parsing off
	req.overrideMimeType('text/plain; charset=x-user-defined');

	// send request
	req.send();

	if (req.readyState != 4 || (req.status != 200 && req.status != 0)) {
		throw "Unable to load model!";
	}

	this.contents = req.responseText;
	this.size = this.contents.length;
	this.pointer = 0;
}

BinaryFileReader.prototype.ignore = function(num_bytes) {
	this.pointer += num_bytes;
}

BinaryFileReader.prototype.readArray = function(num_bytes) {
	var out = this.contents.slice(this.pointer, this.pointer + num_bytes);
	this.pointer += num_bytes;
	return out;
}

BinaryFileReader.prototype.readUInt8 = function() {
	return this.contents.charCodeAt(this.pointer++) & 0xff;
}

BinaryFileReader.prototype.readUInt16 = function() {
	return this.readUInt8() + (this.readUInt8() << 8);
}

BinaryFileReader.prototype.readUInt32 = function() {
	return this.readUInt8() +
		(this.readUInt8() << 8) +
		(this.readUInt8() << 16) +
		(this.readUInt8() << 24);
}

//TODO
BinaryFileReader.prototype.readInt8 = BinaryFileReader.prototype.readUInt8;
BinaryFileReader.prototype.readInt16 = BinaryFileReader.prototype.readUInt16;
BinaryFileReader.prototype.readInt32 = BinaryFileReader.prototype.readUInt32;

BinaryFileReader.prototype.readFloat32 = function() {
	//TODO: NaN and infinities
	var b = this.readUInt32();
	var sign = b & 0x80000000 ? -1 : 1;
	var expo = ((b & 0x7F800000) >> 23) - 127;
	var mant = (b & 0x007FFFFF) | 0x00800000;
	return sign * Math.pow(2, expo) * (mant / (1<<23));
}
