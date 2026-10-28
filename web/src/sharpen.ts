// Фильтр резкости: усиливает разницу пикселя с четырьмя соседями (нерезкая маска 3×3). Нужен, потому что картинки оригинала
// растягиваются под экран и после масштабирования выглядят мягче, чем в оригинале, где они рисуются 1:1.
import { Filter, GlProgram, UniformGroup } from "pixi.js";

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uAmount;
void main(void) {
  vec2 px = uInputSize.zw;
  vec4 c = texture(uTexture, vTextureCoord);
  vec3 n = texture(uTexture, vTextureCoord + vec2(px.x, 0.0)).rgb
         + texture(uTexture, vTextureCoord - vec2(px.x, 0.0)).rgb
         + texture(uTexture, vTextureCoord + vec2(0.0, px.y)).rgb
         + texture(uTexture, vTextureCoord - vec2(0.0, px.y)).rgb;
  vec3 rgb = c.rgb + uAmount * (4.0 * c.rgb - n);
  finalColor = vec4(clamp(rgb, 0.0, c.a), c.a);
}
`;

export class SharpenFilter extends Filter {
  constructor(amount = 0.4) {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: "sharpen-filter" }),
      resources: { sharpenUniforms: new UniformGroup({ uAmount: { value: amount, type: "f32" } }) },
    });
  }
}
