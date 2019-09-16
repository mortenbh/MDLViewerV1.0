//-
//*****************************************************************************
// Copyright (c) 2019 Morten Bojsen-Hansen
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//*****************************************************************************
//+

QuakeMDL.extends(SJSGL.Entity);

function QuakeMDL(url) {
	this.super(SJSGL.Entity);

	f = new BinaryFileReader(url)
	var header = this.parseHeader(f);
	var skins = this.parseSkins(f, header);
	var texCoords = this.parseTexCoords(f, header);
	var triangles = this.parseTriangles(f, header);

	// create mesh
	this.mesh = this.createMesh(f, header, texCoords, triangles);
	this.material = new SJSGL.Material;
	this.material.texture = new SJSGL.Texture2D(header.skin_width, header.skin_height, skins[0].data);
}

QuakeMDL.prototype.parseHeader = function(f) {
	if (f.readInt32() != 1330660425 || f.readInt32() != 6) {
		alert("Not a Quake MDL or wrong MDL version.");
		return false;
	}

	var header = {};

	header.scale = [f.readFloat32(), f.readFloat32(), f.readFloat32()];
	header.translate = [f.readFloat32(), f.readFloat32(), f.readFloat32()];
	f.ignore(4*4); // float boundingradius, vec3 eyepos

	header.num_skins = f.readInt32();
	header.skin_width = f.readInt32();
	header.skin_height = f.readInt32();

	header.num_vertices = f.readInt32();
	header.num_triangles = f.readInt32();
	header.num_frames = f.readInt32();

	f.ignore(4*3); // int synctype, int flags, float size

	return header;
}

QuakeMDL.prototype.parseSkins = function(f, header) {
	var skins = [];

	for (var i=0; i<header.num_skins; ++i) {
		var group = f.readInt32();
		if (group != 0) {
			alert("Skin " + i + " is a group skin, which we don't support yet.");
			return false;
		}

		skins[i] = {
			'group': group,
			'data': []
		};

		for (var j=0; j<header.skin_width*header.skin_height; ++j) {
			var color = QuakeMDL.colorMap[f.readUInt8()];
			skins[i].data.push(color[0]);
			skins[i].data.push(color[1]);
			skins[i].data.push(color[2]);
		}
	}

	return skins;
}

QuakeMDL.prototype.parseTexCoords = function(f, header) {
	var texCoords = [];

	for (var i=0; i<header.num_vertices; ++i) {
		texCoords[i] = {
			'onseam': f.readInt32(),
			's': f.readInt32(),
			't': f.readInt32()
		};
	}

	return texCoords;
}

QuakeMDL.prototype.parseTriangles = function(f, header) {
	var triangles = [];

	for (var i=0; i<header.num_triangles; ++i) {
		triangles[i] = {
			'facefront': f.readInt32() ? true : false,
			'vertexIndex': [f.readInt32(), f.readInt32(), f.readInt32()]
		};
	}

	return triangles;
}

QuakeMDL.prototype.parseSimpleFrame = function(f, header, texCoords, triangles) {
	f.ignore(2*4 + 16); // bboxmin, bboxmax, name[16]

	//var test = f.readArray(16);
	//document.write(test.substring(0, test.indexOf('\0')) + "<br>");

	var vertices = [];
	for (var j=0; j<header.num_vertices; ++j) {
		vertices[j] = {
			'vertex': [f.readInt8(), f.readInt8(), f.readInt8()],
			'normalIndex': f.readInt8()
		};
	}

	var frame = new SJSGL.Mesh.Animation.Frame;

	for (var j=0; j<header.num_triangles; ++j) {
		for (var k=0; k<3; ++k) {
			var pvert = vertices[triangles[j].vertexIndex[k]];

			// vertices
			frame.vertices.push(pvert.vertex[0] * header.scale[0] + header.translate[0]);
			frame.vertices.push(pvert.vertex[1] * header.scale[1] + header.translate[1]);
			frame.vertices.push(pvert.vertex[2] * header.scale[2] + header.translate[2]);

			// normals
			frame.normals.push(QuakeMDL.anormals[pvert.normalIndex][0]);
			frame.normals.push(QuakeMDL.anormals[pvert.normalIndex][1]);
			frame.normals.push(QuakeMDL.anormals[pvert.normalIndex][2]);

			// texture coordinates
			var s = texCoords[triangles[j].vertexIndex[k]].s;
			var t = texCoords[triangles[j].vertexIndex[k]].t;
			if (!triangles[j].facefront && texCoords[triangles[j].vertexIndex[k]].onseam) {
				s += header.skin_width * 0.5;
			}
			frame.texCoords.push((s + 0.5) / header.skin_width);
			frame.texCoords.push((t + 0.5) / header.skin_height);
		}
	}

	return frame;
}

QuakeMDL.prototype.createMesh = function(f, header, texCoords, triangles) {
	var mesh = new SJSGL.Mesh(header.num_triangles * 3);

	// we just dump all frames in a single animation, since animations aren't actually
	// defined in the MDL but are instead hard-coded in QuakeC. We could, however,
	// support standard models in the future by e.g. parsing the name field.

	var animation = new SJSGL.Mesh.Animation("default");
	mesh.animations.push(animation);

	for (var i=0; i<header.num_frames; ++i) {
		// non-group frames
		if (f.readInt32() == 0) {
			var frame = this.parseSimpleFrame(f, header, texCoords, triangles);
			animation.frames.push(frame);

		// group frames
		} else {
			var frames_in_group = f.readInt32();
			f.ignore(2*4); // min, max
			var interval = f.readFloat32(); // only the first one matters?
			f.ignore((frames_in_group - 1) * 4); // ignore rest
			for (var j=0; j<frames_in_group; j++) {
				var frame = this.parseSimpleFrame(f, header, texCoords, triangles);
				animation.frames.push(frame);
			}
		}
	}

	return mesh;
}

QuakeMDL.anormals = [
	[ -0.525731,  0.000000,  0.850651 ],
	[ -0.442863,  0.238856,  0.864188 ],
	[ -0.295242,  0.000000,  0.955423 ],
	[ -0.309017,  0.500000,  0.809017 ],
	[ -0.162460,  0.262866,  0.951056 ],
	[  0.000000,  0.000000,  1.000000 ],
	[  0.000000,  0.850651,  0.525731 ],
	[ -0.147621,  0.716567,  0.681718 ],
	[  0.147621,  0.716567,  0.681718 ],
	[  0.000000,  0.525731,  0.850651 ],
	[  0.309017,  0.500000,  0.809017 ],
	[  0.525731,  0.000000,  0.850651 ],
	[  0.295242,  0.000000,  0.955423 ],
	[  0.442863,  0.238856,  0.864188 ],
	[  0.162460,  0.262866,  0.951056 ],
	[ -0.681718,  0.147621,  0.716567 ],
	[ -0.809017,  0.309017,  0.500000 ],
	[ -0.587785,  0.425325,  0.688191 ],
	[ -0.850651,  0.525731,  0.000000 ],
	[ -0.864188,  0.442863,  0.238856 ],
	[ -0.716567,  0.681718,  0.147621 ],
	[ -0.688191,  0.587785,  0.425325 ],
	[ -0.500000,  0.809017,  0.309017 ],
	[ -0.238856,  0.864188,  0.442863 ],
	[ -0.425325,  0.688191,  0.587785 ],
	[ -0.716567,  0.681718, -0.147621 ],
	[ -0.500000,  0.809017, -0.309017 ],
	[ -0.525731,  0.850651,  0.000000 ],
	[  0.000000,  0.850651, -0.525731 ],
	[ -0.238856,  0.864188, -0.442863 ],
	[  0.000000,  0.955423, -0.295242 ],
	[ -0.262866,  0.951056, -0.162460 ],
	[  0.000000,  1.000000,  0.000000 ],
	[  0.000000,  0.955423,  0.295242 ],
	[ -0.262866,  0.951056,  0.162460 ],
	[  0.238856,  0.864188,  0.442863 ],
	[  0.262866,  0.951056,  0.162460 ],
	[  0.500000,  0.809017,  0.309017 ],
	[  0.238856,  0.864188, -0.442863 ],
	[  0.262866,  0.951056, -0.162460 ],
	[  0.500000,  0.809017, -0.309017 ],
	[  0.850651,  0.525731,  0.000000 ],
	[  0.716567,  0.681718,  0.147621 ],
	[  0.716567,  0.681718, -0.147621 ],
	[  0.525731,  0.850651,  0.000000 ],
	[  0.425325,  0.688191,  0.587785 ],
	[  0.864188,  0.442863,  0.238856 ],
	[  0.688191,  0.587785,  0.425325 ],
	[  0.809017,  0.309017,  0.500000 ],
	[  0.681718,  0.147621,  0.716567 ],
	[  0.587785,  0.425325,  0.688191 ],
	[  0.955423,  0.295242,  0.000000 ],
	[  1.000000,  0.000000,  0.000000 ],
	[  0.951056,  0.162460,  0.262866 ],
	[  0.850651, -0.525731,  0.000000 ],
	[  0.955423, -0.295242,  0.000000 ],
	[  0.864188, -0.442863,  0.238856 ],
	[  0.951056, -0.162460,  0.262866 ],
	[  0.809017, -0.309017,  0.500000 ],
	[  0.681718, -0.147621,  0.716567 ],
	[  0.850651,  0.000000,  0.525731 ],
	[  0.864188,  0.442863, -0.238856 ],
	[  0.809017,  0.309017, -0.500000 ],
	[  0.951056,  0.162460, -0.262866 ],
	[  0.525731,  0.000000, -0.850651 ],
	[  0.681718,  0.147621, -0.716567 ],
	[  0.681718, -0.147621, -0.716567 ],
	[  0.850651,  0.000000, -0.525731 ],
	[  0.809017, -0.309017, -0.500000 ],
	[  0.864188, -0.442863, -0.238856 ],
	[  0.951056, -0.162460, -0.262866 ],
	[  0.147621,  0.716567, -0.681718 ],
	[  0.309017,  0.500000, -0.809017 ],
	[  0.425325,  0.688191, -0.587785 ],
	[  0.442863,  0.238856, -0.864188 ],
	[  0.587785,  0.425325, -0.688191 ],
	[  0.688191,  0.587785, -0.425325 ],
	[ -0.147621,  0.716567, -0.681718 ],
	[ -0.309017,  0.500000, -0.809017 ],
	[  0.000000,  0.525731, -0.850651 ],
	[ -0.525731,  0.000000, -0.850651 ],
	[ -0.442863,  0.238856, -0.864188 ],
	[ -0.295242,  0.000000, -0.955423 ],
	[ -0.162460,  0.262866, -0.951056 ],
	[  0.000000,  0.000000, -1.000000 ],
	[  0.295242,  0.000000, -0.955423 ],
	[  0.162460,  0.262866, -0.951056 ],
	[ -0.442863, -0.238856, -0.864188 ],
	[ -0.309017, -0.500000, -0.809017 ],
	[ -0.162460, -0.262866, -0.951056 ],
	[  0.000000, -0.850651, -0.525731 ],
	[ -0.147621, -0.716567, -0.681718 ],
	[  0.147621, -0.716567, -0.681718 ],
	[  0.000000, -0.525731, -0.850651 ],
	[  0.309017, -0.500000, -0.809017 ],
	[  0.442863, -0.238856, -0.864188 ],
	[  0.162460, -0.262866, -0.951056 ],
	[  0.238856, -0.864188, -0.442863 ],
	[  0.500000, -0.809017, -0.309017 ],
	[  0.425325, -0.688191, -0.587785 ],
	[  0.716567, -0.681718, -0.147621 ],
	[  0.688191, -0.587785, -0.425325 ],
	[  0.587785, -0.425325, -0.688191 ],
	[  0.000000, -0.955423, -0.295242 ],
	[  0.000000, -1.000000,  0.000000 ],
	[  0.262866, -0.951056, -0.162460 ],
	[  0.000000, -0.850651,  0.525731 ],
	[  0.000000, -0.955423,  0.295242 ],
	[  0.238856, -0.864188,  0.442863 ],
	[  0.262866, -0.951056,  0.162460 ],
	[  0.500000, -0.809017,  0.309017 ],
	[  0.716567, -0.681718,  0.147621 ],
	[  0.525731, -0.850651,  0.000000 ],
	[ -0.238856, -0.864188, -0.442863 ],
	[ -0.500000, -0.809017, -0.309017 ],
	[ -0.262866, -0.951056, -0.162460 ],
	[ -0.850651, -0.525731,  0.000000 ],
	[ -0.716567, -0.681718, -0.147621 ],
	[ -0.716567, -0.681718,  0.147621 ],
	[ -0.525731, -0.850651,  0.000000 ],
	[ -0.500000, -0.809017,  0.309017 ],
	[ -0.238856, -0.864188,  0.442863 ],
	[ -0.262866, -0.951056,  0.162460 ],
	[ -0.864188, -0.442863,  0.238856 ],
	[ -0.809017, -0.309017,  0.500000 ],
	[ -0.688191, -0.587785,  0.425325 ],
	[ -0.681718, -0.147621,  0.716567 ],
	[ -0.442863, -0.238856,  0.864188 ],
	[ -0.587785, -0.425325,  0.688191 ],
	[ -0.309017, -0.500000,  0.809017 ],
	[ -0.147621, -0.716567,  0.681718 ],
	[ -0.425325, -0.688191,  0.587785 ],
	[ -0.162460, -0.262866,  0.951056 ],
	[  0.442863, -0.238856,  0.864188 ],
	[  0.162460, -0.262866,  0.951056 ],
	[  0.309017, -0.500000,  0.809017 ],
	[  0.147621, -0.716567,  0.681718 ],
	[  0.000000, -0.525731,  0.850651 ],
	[  0.425325, -0.688191,  0.587785 ],
	[  0.587785, -0.425325,  0.688191 ],
	[  0.688191, -0.587785,  0.425325 ],
	[ -0.955423,  0.295242,  0.000000 ],
	[ -0.951056,  0.162460,  0.262866 ],
	[ -1.000000,  0.000000,  0.000000 ],
	[ -0.850651,  0.000000,  0.525731 ],
	[ -0.955423, -0.295242,  0.000000 ],
	[ -0.951056, -0.162460,  0.262866 ],
	[ -0.864188,  0.442863, -0.238856 ],
	[ -0.951056,  0.162460, -0.262866 ],
	[ -0.809017,  0.309017, -0.500000 ],
	[ -0.864188, -0.442863, -0.238856 ],
	[ -0.951056, -0.162460, -0.262866 ],
	[ -0.809017, -0.309017, -0.500000 ],
	[ -0.681718,  0.147621, -0.716567 ],
	[ -0.681718, -0.147621, -0.716567 ],
	[ -0.850651,  0.000000, -0.525731 ],
	[ -0.688191,  0.587785, -0.425325 ],
	[ -0.587785,  0.425325, -0.688191 ],
	[ -0.425325,  0.688191, -0.587785 ],
	[ -0.425325, -0.688191, -0.587785 ],
	[ -0.587785, -0.425325, -0.688191 ],
	[ -0.688191, -0.587785, -0.425325 ]
];

QuakeMDL.colorMap = [
	[  0,   0,   0], [ 15,  15,  15], [ 31,  31,  31], [ 47,  47,  47],
	[ 63,  63,  63], [ 75,  75,  75], [ 91,  91,  91], [107, 107, 107],
	[123, 123, 123], [139, 139, 139], [155, 155, 155], [171, 171, 171],
	[187, 187, 187], [203, 203, 203], [219, 219, 219], [235, 235, 235],
	[ 15,  11,   7], [ 23,  15,  11], [ 31,  23,  11], [ 39,  27,  15],
	[ 47,  35,  19], [ 55,  43,  23], [ 63,  47,  23], [ 75,  55,  27],
	[ 83,  59,  27], [ 91,  67,  31], [ 99,  75,  31], [107,  83,  31],
	[115,  87,  31], [123,  95,  35], [131, 103,  35], [143, 111,  35],
	[ 11,  11,  15], [ 19,  19,  27], [ 27,  27,  39], [ 39,  39,  51],
	[ 47,  47,  63], [ 55,  55,  75], [ 63,  63,  87], [ 71,  71, 103],
	[ 79,  79, 115], [ 91,  91, 127], [ 99,  99, 139], [107, 107, 151],
	[115, 115, 163], [123, 123, 175], [131, 131, 187], [139, 139, 203],
	[  0,   0,   0], [  7,   7,   0], [ 11,  11,   0], [ 19,  19,   0],
	[ 27,  27,   0], [ 35,  35,   0], [ 43,  43,   7], [ 47,  47,   7],
	[ 55,  55,   7], [ 63,  63,   7], [ 71,  71,   7], [ 75,  75,  11],
	[ 83,  83,  11], [ 91,  91,  11], [ 99,  99,  11], [107, 107,  15],
	[  7,   0,   0], [ 15,   0,   0], [ 23,   0,   0], [ 31,   0,   0],
	[ 39,   0,   0], [ 47,   0,   0], [ 55,   0,   0], [ 63,   0,   0],
	[ 71,   0,   0], [ 79,   0,   0], [ 87,   0,   0], [ 95,   0,   0],
	[103,   0,   0], [111,   0,   0], [119,   0,   0], [127,   0,   0],
	[ 19,  19,   0], [ 27,  27,   0], [ 35,  35,   0], [ 47,  43,   0],
	[ 55,  47,   0], [ 67,  55,   0], [ 75,  59,   7], [ 87,  67,   7],
	[ 95,  71,   7], [107,  75,  11], [119,  83,  15], [131,  87,  19],
	[139,  91,  19], [151,  95,  27], [163,  99,  31], [175, 103,  35],
	[ 35,  19,   7], [ 47,  23,  11], [ 59,  31,  15], [ 75,  35,  19],
	[ 87,  43,  23], [ 99,  47,  31], [115,  55,  35], [127,  59,  43],
	[143,  67,  51], [159,  79,  51], [175,  99,  47], [191, 119,  47],
	[207, 143,  43], [223, 171,  39], [239, 203,  31], [255, 243,  27],
	[ 11,   7,   0], [ 27,  19,   0], [ 43,  35,  15], [ 55,  43,  19],
	[ 71,  51,  27], [ 83,  55,  35], [ 99,  63,  43], [111,  71,  51],
	[127,  83,  63], [139,  95,  71], [155, 107,  83], [167, 123,  95],
	[183, 135, 107], [195, 147, 123], [211, 163, 139], [227, 179, 151],
	[171, 139, 163], [159, 127, 151], [147, 115, 135], [139, 103, 123],
	[127,  91, 111], [119,  83,  99], [107,  75,  87], [ 95,  63,  75],
	[ 87,  55,  67], [ 75,  47,  55], [ 67,  39,  47], [ 55,  31,  35],
	[ 43,  23,  27], [ 35,  19,  19], [ 23,  11,  11], [ 15,   7,   7],
	[187, 115, 159], [175, 107, 143], [163,  95, 131], [151,  87, 119],
	[139,  79, 107], [127,  75,  95], [115,  67,  83], [107,  59,  75],
	[ 95,  51,  63], [ 83,  43,  55], [ 71,  35,  43], [ 59,  31,  35],
	[ 47,  23,  27], [ 35,  19,  19], [ 23,  11,  11], [ 15,   7,   7],
	[219, 195, 187], [203, 179, 167], [191, 163, 155], [175, 151, 139],
	[163, 135, 123], [151, 123, 111], [135, 111,  95], [123,  99,  83],
	[107,  87,  71], [ 95,  75,  59], [ 83,  63,  51], [ 67,  51,  39],
	[ 55,  43,  31], [ 39,  31,  23], [ 27,  19,  15], [ 15,  11,   7],
	[111, 131, 123], [103, 123, 111], [ 95, 115, 103], [ 87, 107,  95],
	[ 79,  99,  87], [ 71,  91,  79], [ 63,  83,  71], [ 55,  75,  63],
	[ 47,  67,  55], [ 43,  59,  47], [ 35,  51,  39], [ 31,  43,  31],
	[ 23,  35,  23], [ 15,  27,  19], [ 11,  19,  11], [  7,  11,   7],
	[255, 243,  27], [239, 223,  23], [219, 203,  19], [203, 183,  15],
	[187, 167,  15], [171, 151,  11], [155, 131,   7], [139, 115,   7],
	[123,  99,   7], [107,  83,   0], [ 91,  71,   0], [ 75,  55,   0],
	[ 59,  43,   0], [ 43,  31,   0], [ 27,  15,   0], [ 11,   7,   0],
	[  0,   0, 255], [ 11,  11, 239], [ 19,  19, 223], [ 27,  27, 207],
	[ 35,  35, 191], [ 43,  43, 175], [ 47,  47, 159], [ 47,  47, 143],
	[ 47,  47, 127], [ 47,  47, 111], [ 47,  47,  95], [ 43,  43,  79],
	[ 35,  35,  63], [ 27,  27,  47], [ 19,  19,  31], [ 11,  11,  15],
	[ 43,   0,   0], [ 59,   0,   0], [ 75,   7,   0], [ 95,   7,   0],
	[111,  15,   0], [127,  23,   7], [147,  31,   7], [163,  39,  11],
	[183,  51,  15], [195,  75,  27], [207,  99,  43], [219, 127,  59],
	[227, 151,  79], [231, 171,  95], [239, 191, 119], [247, 211, 139],
	[167, 123,  59], [183, 155,  55], [199, 195,  55], [231, 227,  87],
	[127, 191, 255], [171, 231, 255], [215, 255, 255], [103,   0,   0],
	[139,   0,   0], [179,   0,   0], [215,   0,   0], [255,   0,   0],
	[255, 243, 147], [255, 247, 199], [255, 255, 255], [159,  91,  83]
];
