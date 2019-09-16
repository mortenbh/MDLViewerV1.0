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

///////////////////////////////////////////////////////////////////////////////
//// Utility methods for object-oriented Javascript ///////////////////////////
///////////////////////////////////////////////////////////////////////////////

Object.prototype.super = function(parent) {
	if( arguments.length > 1 ) {
		parent.apply(this, Array.prototype.slice.call(arguments, 1));
	} else {
		parent.call(this);
	}
}

Function.prototype.extends = function(parent) {
	this.prototype = new parent();
	this.prototype.constructor = this;
}



var SJSGL = {};

(function(SJSGL){

///////////////////////////////////////////////////////////////////////////////
//// Application //////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

SJSGL.Application = function(canvas) {
	this.canvas = canvas;

	try {
		gl = canvas.getContext("webgl");
	} catch (e) {}

	if (!gl) {
		alert("Unable to initialize WebGL.");
		return false;
	}

	this.gl = gl;
	this.entities = [];
	this.lights = [];
	this.perspectiveMatrix = Matrix.I(4);
	this.modelViewMatrix = Matrix.I(4);

	// TODO: maybe find a more appropritate place for this
	this.gl.clearColor(0.4, 0.4, 0.4, 1.0);
	this.gl.clearDepth(1.0);
	this.gl.enable(gl.DEPTH_TEST);
	this.gl.depthFunc(gl.LEQUAL);
}

SJSGL.Application.prototype.setPerspective = function(fovy, aspect, znear, zfar) {
	function makeFrustum(left, right, bottom, top, znear, zfar) {
		var X = 2*znear/(right-left);
		var Y = 2*znear/(top-bottom);
		var A = (right+left)/(right-left);
		var B = (top+bottom)/(top-bottom);
		var C = -(zfar+znear)/(zfar-znear);
		var D = -2*zfar*znear/(zfar-znear);

		return $M([[X, 0, A, 0],
		[0, Y, B, 0],
		[0, 0, C, D],
		[0, 0, -1, 0]]);
	}

	var ymax = znear * Math.tan(fovy * Math.PI / 360.0);
	var ymin = -ymax;
	var xmin = ymin * aspect;
	var xmax = ymax * aspect;

	this.perspectiveMatrix = makeFrustum(xmin, xmax, ymin, ymax, znear, zfar);
}

SJSGL.Application.prototype.mvLoadIdentity = function(v) {
	this.modelViewMatrix = Matrix.I(4);
}

SJSGL.Application.prototype.mvTranslate = function(v) {
	this.modelViewMatrix = this.modelViewMatrix.x(Matrix.Translation($V([v[0], v[1], v[2]])).ensure4x4());
}

SJSGL.Application.prototype.mvRotate = function(ang, v) {
	var arad = ang * Math.PI / 180.0;
	var m = Matrix.Rotation(arad, $V([v[0], v[1], v[2]])).ensure4x4();
	this.modelViewMatrix = this.modelViewMatrix.x(m);
}

SJSGL.Application.prototype.addEntity = function(entity) {
	entity.initGL(this.gl);
	this.entities.push(entity);
}

SJSGL.Application.prototype.addLight = function(light) {
	this.lights.push(light);
}

SJSGL.Application.prototype.draw = function() {
	if (!this.startTime) this.startTime = new Date().getTime() / 200;
	this.timeElapsed = (new Date().getTime() / 200) - this.startTime;

	this.gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	for (var i=0; i<this.entities.length; ++i) this.entities[i].draw(this);
}

SJSGL.Application.prototype.getGLContext = function() { return this.gl; }
SJSGL.Application.prototype.getPerspectiveMatrix = function() { return this.perspectiveMatrix; }
SJSGL.Application.prototype.getModelViewMatrix = function() { return this.modelViewMatrix; }
SJSGL.Application.prototype.getNormalMatrix = function() {
	// cache this?
	return this.modelViewMatrix.make3x3().inverse().transpose();
}



///////////////////////////////////////////////////////////////////////////////
//// Mesh /////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

SJSGL.Mesh = function(vertices_per_frame) {
	this.vertices_per_frame = vertices_per_frame;
	this.animations = [];
}

SJSGL.Mesh.prototype.initGL = function(gl) {
	for (var i=0; i<this.animations.length; ++i) {
		for (var j=0; j<this.animations[i].frames.length; ++j) {
			var frame = this.animations[i].frames[j];

			frame.vertexBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, frame.vertexBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frame.vertices), gl.STATIC_DRAW);

			frame.normalBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, frame.normalBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frame.normals), gl.STATIC_DRAW);

			frame.texCoordsBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, frame.texCoordsBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frame.texCoords), gl.STATIC_DRAW);

			delete frame.vertices;
			delete frame.normals;
			delete frame.texCoords;
		}
	}
}

SJSGL.Mesh.Animation = function(name) {
	this.name = name;
	this.frames = [];
}

SJSGL.Mesh.Animation.Frame = function() {
	this.vertices = [];
	this.normals = [];
	this.texCoords = [];
	this.vertexBuffer = null;
	this.normalBuffer = null;
	this.texCoordsBuffer = null;
}



///////////////////////////////////////////////////////////////////////////////
//// Texture2D ////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

SJSGL.Texture2D = function(width, height, data) {
	this.width = width;
	this.height = height;
	this.data = data;
}

SJSGL.Texture2D.prototype.initGL = function(gl) {
	this.texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, this.texture);
	gl.texImage2D(
		gl.TEXTURE_2D, 0, gl.RGB, this.width, this.height, 0,
		gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(this.data)
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.bindTexture(gl.TEXTURE_2D, null);
}



///////////////////////////////////////////////////////////////////////////////
//// Material /////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

SJSGL.Material = function() {
	// initialize to OpenGL defaults
	this.emissive = [0.0, 0.0, 0.0, 1.0];
	this.ambient = [0.2, 0.2, 0.2, 1.0];
	this.diffuse = [0.8, 0.8, 0.8, 1.0];
	this.specular = [0.0, 0.0, 0.0, 1.0];
	this.shininess = 0; // range [0;128]
	this.texture = null;
}

SJSGL.Material.prototype.initGL = function(gl) {
	var vertexSource = ""
		+ "attribute vec3 aPositionA;\n"
		+ "attribute vec3 aPositionB;\n"
		+ "attribute vec3 aNormalA;\n"
		+ "attribute vec3 aNormalB;\n"
		+ "attribute vec2 aTexCoordsA;\n"
		+ "attribute vec2 aTexCoordsB;\n"
		+ ""
		+ "uniform mat4 uMVMatrix;\n"
		+ "uniform mat4 uPMatrix;\n"
		+ "uniform mat3 uNormalMatrix;\n"
		+ ""
		+ "uniform vec4 uMatEmissive;\n"
		+ "uniform vec4 uMatAmbient;\n"
		+ "uniform vec4 uLightEmissive;\n"
		+ "uniform vec4 uLightAmbient;\n"
		+ "uniform vec3 uLightPos\n;"
		+ ""
		+ "uniform float uInterp\n;"
		+ ""
		+ "varying vec3 vPositionES;\n"
		+ "varying vec3 vNormalES;\n"
		+ "varying vec3 vLightES;\n"
		+ "varying vec3 vEyeES;\n"
		+ "varying vec4 vColor;\n"
		+ "varying vec2 vTexCoords;\n"
		+ ""
		+ "void main(void) {\n"
		+ "	vec3 position = mix(aPositionA, aPositionB, uInterp);\n"
		+ "	vec3 normal = normalize(mix(aNormalA, aNormalB, uInterp));\n"
		+ "	vec2 texCoords = mix(aTexCoordsA, aTexCoordsB, uInterp);\n"
		+ ""
		+ "	gl_Position = uPMatrix * uMVMatrix * vec4(position, 1.0);\n"
		+ ""
		+ "	vPositionES = mat3(uMVMatrix) * position;\n"
		+ "	vNormalES = normalize(uNormalMatrix * normal);\n"
		+ "	vLightES = uLightPos - vPositionES;\n"
		+ "	vEyeES = -vPositionES;\n"
		+ ""
		+ "	vColor = uMatEmissive + uMatAmbient*uLightAmbient;\n"
		+ "	vTexCoords = texCoords;\n"
		+ "}";


	var fragmentSource = ""
		+ "precision mediump float;"
		+ ""
		+ "uniform vec4 uMatDiffuse;\n"
		+ "uniform vec4 uMatSpecular;\n"
		+ "uniform float uMatShininess;\n"
		+ "uniform vec4 uLightDiffuse;\n"
		+ "uniform vec4 uLightSpecular;\n"
		+ ""
		+ "uniform sampler2D uTexture;\n"
		+ ""
		+ "varying vec3 vPositionES;\n"
		+ "varying vec3 vNormalES;\n"
		+ "varying vec3 vLightES;\n"
		+ "varying vec3 vEyeES;\n"
		+ "varying vec4 vColor;\n"
		+ "varying vec2 vTexCoords;\n"
		+ ""
		+ "void main(void) {\n"
		+ "	vec3 normalES = normalize(vNormalES);\n"
		+ "	vec3 lightES = normalize(vLightES);\n"
		+ "	vec3 eyeES = normalize(vEyeES);\n"
		+ ""
		+ "	float diffuseLight = clamp(dot(normalES, lightES), 0.0, 1.0);\n"
		+ "	vec4 diffuse = uMatDiffuse * diffuseLight;\n"
		+ ""
		+ "	vec3 halfAngle = normalize(lightES + eyeES);\n"
		+ "	float specularLight = pow(clamp(dot(normalES, halfAngle), 0.0, 1.0), uMatShininess);\n"
		+ "	if (diffuseLight <= 0.0) specularLight = 0.0;\n"
		+ "	vec4 specular = uMatSpecular * specularLight;\n"
		+ ""
		+ "	gl_FragColor = texture2D(uTexture, vTexCoords) * (vColor + diffuse + specular);\n"
		+ "}";

	var vertexShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertexShader, vertexSource);
	gl.compileShader(vertexShader);
	if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
		alert(gl.getShaderInfoLog(vertexShader));
		return false;
	}

	var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, fragmentSource);
	gl.compileShader(fragmentShader);
	if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
		alert(gl.getShaderInfoLog(fragmentShader));
		return false;
	}

	this.shaderProgram = gl.createProgram();
	gl.attachShader(this.shaderProgram, vertexShader);
	gl.attachShader(this.shaderProgram, fragmentShader);
	gl.linkProgram(this.shaderProgram);

	if (!gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS)) {
		alert("Unable to initialize the material shader.");
		return false;
	}

	gl.useProgram(this.shaderProgram);

	this.positionAAttribute = gl.getAttribLocation(this.shaderProgram, "aPositionA");
	gl.enableVertexAttribArray(this.positionAAttribute);

	this.positionBAttribute = gl.getAttribLocation(this.shaderProgram, "aPositionB");
	gl.enableVertexAttribArray(this.positionBAttribute);

	this.normalAAttribute = gl.getAttribLocation(this.shaderProgram, "aNormalA");
	gl.enableVertexAttribArray(this.normalAAttribute);

	this.normalBAttribute = gl.getAttribLocation(this.shaderProgram, "aNormalB");
	gl.enableVertexAttribArray(this.normalBAttribute);

	this.texCoordsAAttribute = gl.getAttribLocation(this.shaderProgram, "aTexCoordsA");
	gl.enableVertexAttribArray(this.texCoordsAAttribute);

	this.texCoordsBAttribute = gl.getAttribLocation(this.shaderProgram, "aTexCoordsB");
	gl.enableVertexAttribArray(this.texCoordsBAttribute);

	// initalize texture, if any
	if (this.texture != null) {
		this.texture.initGL(gl);
	}
}

SJSGL.Material.prototype.setUniforms = function(renderer) {
	var gl = renderer.getGLContext();

	// matrices (TODO: place location elsewhere?)
	var pUniform = gl.getUniformLocation(this.shaderProgram, "uPMatrix");
	gl.uniformMatrix4fv(pUniform, false, new Float32Array(renderer.getPerspectiveMatrix().flatten()));

	var mvUniform = gl.getUniformLocation(this.shaderProgram, "uMVMatrix");
	gl.uniformMatrix4fv(mvUniform, false, new Float32Array(renderer.getModelViewMatrix().flatten()));

	var normalMatrixUniform = gl.getUniformLocation(this.shaderProgram, "uNormalMatrix");
	gl.uniformMatrix3fv(normalMatrixUniform, false, new Float32Array(renderer.getNormalMatrix().flatten()));

	// material
	var matEmissiveUniform = gl.getUniformLocation(this.shaderProgram, "uMatEmissive");
	gl.uniform4fv(matEmissiveUniform, new Float32Array(this.emissive));

	var matAmbientUniform = gl.getUniformLocation(this.shaderProgram, "uMatAmbient");
	gl.uniform4fv(matAmbientUniform, new Float32Array(this.ambient));

	var matDiffuseUniform = gl.getUniformLocation(this.shaderProgram, "uMatDiffuse");
	gl.uniform4fv(matDiffuseUniform, new Float32Array(this.diffuse));

	var matSpecularUniform = gl.getUniformLocation(this.shaderProgram, "uMatSpecular");
	gl.uniform4fv(matSpecularUniform, new Float32Array(this.specular));

	var matShininessUniform = gl.getUniformLocation(this.shaderProgram, "uMatShininess");
	gl.uniform1f(matShininessUniform, this.shininess);

	// texture, if any
	if (this.texture != null) {
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texture.texture);
		var texUniform = gl.getUniformLocation(this.shaderProgram, "uTexture");
		gl.uniform1i(texUniform, 0);
	}

	// lights (now this REALLY needs to go somewhere else...)
	var lightPosUniform = gl.getUniformLocation(this.shaderProgram, "uLightPos");
	gl.uniform3fv(lightPosUniform, new Float32Array(renderer.lights[0].position));
	var lightAmbientUniform = gl.getUniformLocation(this.shaderProgram, "uLightAmbient");
	gl.uniform4fv(lightAmbientUniform, new Float32Array(renderer.lights[0].ambient));
	var lightDiffuseUniform = gl.getUniformLocation(this.shaderProgram, "uLightDiffuse");
	gl.uniform4fv(lightDiffuseUniform, new Float32Array(renderer.lights[0].diffuse));
	var lightSpecularUniform = gl.getUniformLocation(this.shaderProgram, "uLightSpecular");
	gl.uniform4fv(lightSpecularUniform, new Float32Array(renderer.lights[0].specular));

	// interpolation of vertices
	var interpUniform = gl.getUniformLocation(this.shaderProgram, "uInterp");
	gl.uniform1f(interpUniform, renderer.timeElapsed % 1);
}



///////////////////////////////////////////////////////////////////////////////
//// Entity ///////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// should probably support submeshes and submaterials
SJSGL.Entity = function(mesh, material) {
	this.mesh = mesh;
	this.material = material;
}

SJSGL.Entity.prototype.initGL = function(gl) {
	this.mesh.initGL(gl);
	this.material.initGL(gl);
}

SJSGL.Entity.prototype.draw = function(renderer) {
	var gl = renderer.getGLContext();
	this.material.setUniforms(renderer);

	var frameIdx = Math.floor(renderer.timeElapsed % this.mesh.animations[0].frames.length);
	var frameA = this.mesh.animations[0].frames[frameIdx];
	var frameB = this.mesh.animations[0].frames[(frameIdx + 1) % this.mesh.animations[0].frames.length];

	// vertices
	gl.bindBuffer(gl.ARRAY_BUFFER, frameA.vertexBuffer);
	gl.vertexAttribPointer(this.material.positionAAttribute, 3, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, frameB.vertexBuffer);
	gl.vertexAttribPointer(this.material.positionBAttribute, 3, gl.FLOAT, false, 0, 0);

	// normals
	//if (frameA.normals.length > 0) {
		gl.bindBuffer(gl.ARRAY_BUFFER, frameA.normalBuffer);
		gl.vertexAttribPointer(this.material.normalAAttribute, 3, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, frameB.normalBuffer);
		gl.vertexAttribPointer(this.material.normalBAttribute, 3, gl.FLOAT, false, 0, 0);
	//}

	// texture coordinates
	//if (frameA.texCoords.length > 0) {
		gl.bindBuffer(gl.ARRAY_BUFFER, frameA.texCoordsBuffer);
		gl.vertexAttribPointer(this.material.texCoordsAAttribute, 2, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, frameB.texCoordsBuffer);
		gl.vertexAttribPointer(this.material.texCoordsBAttribute, 2, gl.FLOAT, false, 0, 0);
	//}

	gl.drawArrays(gl.TRIANGLES, 0, this.mesh.vertices_per_frame);
}



///////////////////////////////////////////////////////////////////////////////
//// Light ////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

SJSGL.Light = function(position) {
	this.position = position || [0.0, 0.0, 0.0, 1.0];
	this.ambient = [0.0, 0.0, 0.0, 1.0];
	this.diffuse = [1.0, 1.0, 1.0, 1.0];
	this.specular = [1.0, 1.0, 1.0, 1.0];
}

})(SJSGL);
