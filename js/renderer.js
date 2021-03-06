/*
* ===========================================================================
* 
* Wolf3D Browser Version GPL Source Code
* Copyright (C) 2012 id Software LLC, a ZeniMax Media company. 
* 
* This file is part of the Wolf3D Browser Version GPL Source Code ("Wolf3D Browser Source Code").  
* 
* Wolf3D Browser Source Code is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 2 of the License, or
* (at your option) any later version.
* 
* Wolf3D Browser Source Code is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
* 
* You should have received a copy of the GNU General Public License version 2
* along with Wolf3D Browser Source Code.  If not, see <http://www.gnu.org/licenses/>.
* 
* If you have questions concerning this license, you may contact in writing id Software LLC, c/o ZeniMax Media Inc., Suite 120, Rockville, Maryland 20850 USA.
* 
* ===========================================================================
*/

Wolf.setConsts({
    FOV_RAD             : 75 * Math.PI / 180,
    ISCHROME            : /chrome/.test(navigator.userAgent.toLowerCase()),
    ISSAFARI            : /safari/.test(navigator.userAgent.toLowerCase()),
    ISFIREFOX           : /firefox/.test(navigator.userAgent.toLowerCase()),
    ISXP                : /windows nt 5\./.test(navigator.userAgent.toLowerCase()),
    ISWEBKIT            : /webkit/.test(navigator.userAgent.toLowerCase())
});
Wolf.setConsts({
    VIEW_DIST           : (Wolf.XRES / 2) / Math.tan((Wolf.FOV_RAD / 2)),
    TEXTURERESOLUTION   : Wolf.ISCHROME ? 128 : 64
});


Wolf.Renderer = (function() {
    
    var slices = [],
        tiles = [],
        useBackgroundImage = Wolf.ISWEBKIT,
        texturePath = "art/walls-shaded/" + Wolf.TEXTURERESOLUTION + "/",
        spritePath = "art/sprites/" + Wolf.TEXTURERESOLUTION + "/",
        sprites = [],
        maxDistZ = 64 * 0x10000,
        hasInit = false;
        visibleSprites = [];
        
    var TILESHIFT = Wolf.TILESHIFT,
        TILEGLOBAL = Wolf.TILEGLOBAL,
        TRACE_HIT_VERT = Wolf.TRACE_HIT_VERT,
        TRACE_HIT_DOOR = Wolf.TRACE_HIT_DOOR,
        WALL_TILE = Wolf.WALL_TILE,
        DOOR_TILE = Wolf.DOOR_TILE,
        TEX_PLATE = Wolf.TEX_PLATE,
        TILE2POS = Wolf.TILE2POS,
        POS2TILE = Wolf.POS2TILE,
        VIEW_DIST = Wolf.VIEW_DIST,
        SLICE_WIDTH = Wolf.SLICE_WIDTH,
        WALL_TEXTURE_WIDTH = Wolf.WALL_TEXTURE_WIDTH,
        FINE2RAD = Wolf.FINE2RAD,
        XRES = Wolf.XRES,
        YRES = Wolf.YRES,
        MINDIST = Wolf.MINDIST,
        cos = Math.cos,
        sin = Math.sin,
        tan = Math.tan,
        atan2 = Math.atan2,
        round = Math.round,
        sqrt = Math.sqrt;

    function init() {
        var image, slice, x, y;
        if (hasInit) {
            return;
        }
        hasInit = true;
    
        $("#game .renderer")
            .width(Wolf.XRES + "px")
            .height(Wolf.YRES + "px");

        // // here we need to make an array of tiles that will hold textures/sprites

        var xTiles = Math.ceil(XRES / 64) + 1,
            yTiles = Math.ceil(YRES / 64) + 1;
        
        // here we need to make an array of tiles that will hold textures/sprites
        for(var x=0; x <= xTiles; x++){
            var col = [];
            for(var y=0; y <= yTiles; y++){
                var tile = $("<div>");
                tile.css({
                    position : "absolute",
                    width : "64px",
                    height : "64px",
                    left : x * 64 + "px",
                    top : (yTiles - y) * 64 + "px",
                    overflow : "hidden",
                })
                tile.appendTo("#game .renderer");
                var img = $("<div>");
                img.css({
                    position : "absolute",
                    display : "block",
                    top : 0,
                    height : "7680px",
                    width : "64px",
                    backgroundSize : "100% 100%",
                });
                img.appendTo(tile)
                col.push(img);
            }
            tiles.push(col);
        }
    }
    
    function reset() {
        $("#game .renderer .sprite").remove();
        sprites = [];
        visibleSprites = [];
    }
    
    function processTrace(viewport, tracePoint) {
        var x = tracePoint.x,
            y = tracePoint.y,
            vx = viewport.x,
            vy = viewport.y,
            
            dx = viewport.x - tracePoint.x,
            dy = viewport.y - tracePoint.y,
            dist = Math.sqrt(dx*dx + dy*dy),
            frac,
            h, w, offset;

        // correct for fisheye
        dist = dist * cos(FINE2RAD(tracePoint.angle - viewport.angle));
        
        w = WALL_TEXTURE_WIDTH * SLICE_WIDTH;
        h = (VIEW_DIST / dist * TILEGLOBAL) >> 0;
        
        if (tracePoint.flags & TRACE_HIT_DOOR) {
            if (tracePoint.flags & TRACE_HIT_VERT) {
                if (x < vx) {
                    frac = tracePoint.frac;
                } else {
                    frac = 1 - tracePoint.frac;
                }
            } else {
                if (y < vy) {
                    frac = 1 - tracePoint.frac;
                } else {
                    frac = tracePoint.frac;
                }
            }
        } else {
            frac = 1 - tracePoint.frac;
        }
       
        offset = frac * w;
        if (offset > w - SLICE_WIDTH) {
            offset = w - SLICE_WIDTH;
        }
        offset = round(offset / SLICE_WIDTH) * SLICE_WIDTH;
        if (offset < 0) {
            offset = 0;
        }
        
        return {
            w : w,
            h : h,
            dist : dist,
            vert : tracePoint.flags & TRACE_HIT_VERT,
            offset : offset
        };
    }
    
    function clear() {
        var n, sprite;
        for (n=0;n<visibleSprites.length;n++) {
            sprite = visibleSprites[n].sprite;
            if (sprite && sprite.div) {
                sprite.div.style.display = "none";
            }
        }
    }
    
    function draw(viewport, level) {
        drawWalls(viewport, level); // also draws doors
        drawSprites(viewport, level);
        drawWeapon(viewport);
    }

    function drawWalls(viewport, level){
        var xTiles = Math.ceil(XRES / 64) + 1,
            yTiles = Math.ceil(YRES / 64) + 1,
            xBjTile = POS2TILE(viewport.x), 
            yBjTile = POS2TILE(viewport.y),
            xTileStart = xBjTile - Math.floor(xTiles / 2),
            yTileStart = yBjTile - Math.floor(yTiles / 2),
            textureSrc = "art/walls-shaded/64/walls.png";

        // apply textures to tiles surrounding BJ 
        for(var y=0; y <= yTiles; y++){
            for(var x=0; x <= xTiles; x++){
                var levelX = xTileStart + x,
                    levelY = yTileStart + y,
                    img = tiles[x][y],
                    texture,
                    door = 0,
                    {top, left} = topLeftForPos(Wolf.TILE2POS(levelX), Wolf.TILE2POS(levelY), viewport);
                img.css({
                    left: "0px",
                });
                img.parent().css({
                    top: top + "px",
                    left: left + "px",
                    transform: ""
                });
                // make sure we're not out of bounds
                if (levelX < 0 || levelX >= 64 || levelY < 0 || levelY >= 64) {
                    img.css({
                        top: "64px"
                    });
                    continue;
                }
                door = level.state.doorMap[levelX][levelY];
                if(door !== 0 && door.action !== 2){
                    if (Math.abs(door.action) == 1) {
                        img.css({
                            left: -(door.ticcount) + "px"
                        });
                    }
                    if (door.vertical) {
                        img.parent().css({
                            // this and the else case make the doors thinner so BJ doesn't overlap with them but it looks worse
                            // transform: "scaleX(0.75) rotate(90deg)",
                            transform: "rotate(90deg)",
                        });
                    // } else {
                    //     img.parent().css({
                    //         transform: "scaleY(0.75)",
                    //     });
                    }
                    texture = door.texture + 1;
                    if (texture % 2 == 0) {
                        texture -= 1;
                    }
                }
                else {
                    texture = level.wallTexX[levelX][levelY];
                    if (level.tileMap[levelX][levelY] & Wolf.PUSHWALL_TILE) {
                        var pwall = Wolf.PushWall.get(),
                            offset = pwall.pointsMoved / 128;
                        img.parent().css({
                            marginLeft: pwall.dx * 64 * offset + "px",
                            marginTop: -pwall.dy * 64 * offset + "px"
                        });
                    } else {
                        img.parent().css({
                            marginLeft: 0,
                            marginTop: 0
                        });
                    }
                }
                var itop = -(texture - 1) * 64;
                img.css({
                    backgroundImage: "url(" + textureSrc + ")",
                    top: itop + "px"
                });
            }
        }

    }
        
    function drawSprites(viewport, level) {
        var vis, n,
            dist, dx, dy, angle,
            z, width, size,
            div, image,
            divStyle, imgStyle;

        var xTiles = Math.ceil(XRES / 64) + 1,
            yTiles = Math.ceil(YRES / 64) + 1,
            xBjTile = POS2TILE(viewport.x), 
            yBjTile = POS2TILE(viewport.y),
            xTileStart = xBjTile - Math.floor(xTiles / 2),
            yTileStart = yBjTile - Math.floor(yTiles / 2);
        
        for(sprite of level.sprites){
            var x = sprite.tile.x, 
                y = sprite.tile.y;
            if (x >= xTileStart && x <= xTileStart + xTiles &&
                y >= yTileStart && y <= yTileStart + yTiles) {
                // make sure sprite is loaded
                if (!sprite.div) {
                    loadSprite(sprite)
                }
                
                div = sprite.div;
                divStyle = div.style;
                
                image = div.image;
                imgStyle = image.style;
                   
                size = 64;

                var xSpriteTile = x - xTileStart,
                    ySpriteTile = y - yTileStart;
                divStyle.display = "block";
                divStyle.width = size + "px";
                divStyle.height = size + "px";
                
                var {top, left} = topLeftForPos(sprite.x, sprite.y, viewport);
                divStyle.top = top + "px";
                divStyle.left = left + "px";
            
                texture = Wolf.Sprites.getTexture(sprite.tex[0]);
                textureSrc = spritePath + texture.sheet;

                if (image._src != textureSrc) {
                    image._src = textureSrc;
                    if (useBackgroundImage) {
                        imgStyle.backgroundImage = "url(" + textureSrc + ")";
                    } else {
                        image.src = textureSrc;
                    }
                }

                z = (maxDistZ - dist) >> 0;
                width = texture.num * size;
                left = -texture.idx * size;
                    
                if (div._zIndex != z) {
                    divStyle.zIndex = div._zIndex = z;
                }
                if (image._width != width) {
                    imgStyle.width = (image._width = width) + "px";
                }
                if (image._height != size) {
                    imgStyle.height = (image._height = size) + "px";
                }
                if (image._left != left) {
                    imgStyle.left = (image._left = left) + "px";
                }
            } else if (sprite.div){
                unloadSprite(sprite);
            }
        }
    }

    function drawWeapon(viewport){
        var bjCenterX = Wolf.XRES / 2,
            bjCenterY = Wolf.YRES / 2,
            weapon = $("#game .renderer .player-weapon"),
            angle = Wolf.FINE2DEG(viewport.angle),
            radius = 32,
            h = radius * Wolf.Math.SinTable[viewport.angle],
            w = radius * Wolf.Math.CosTable[viewport.angle];
        weapon.css({
            top: bjCenterY - h + "px",
            left: bjCenterX + w + "px",
            transform: "rotate(" + (90 - angle) + "deg)"
        });

    }

    function topLeftForPos(x, y, viewport){
        var bjCenterX = Wolf.XRES / 2,
            bjCenterY = Wolf.YRES / 2,
            bjTop = Wolf.YRES / 2 + 32,
            bjLeft = Wolf.XRES / 2 - 32,
            dx = x - viewport.x,
            dy = y - viewport.y;
        return {top: Wolf.YRES - (bjTop + (64 * dy/TILEGLOBAL)), left: bjLeft + (64 * dx/TILEGLOBAL)};
    }
    
    function unloadSprite(sprite) {
        if (sprite.div) {
            $(sprite.div).remove();
            sprite.div = null;
        }
    }
    
    function loadSprite(sprite) {
        var div = document.createElement("div"),
            image;

        div.style.display = "none";
        div.style.position = "absolute";
        div.style.width = "128px";
        div.style.height = "128px";
        div.style.overflow = "hidden";
        div.className = "sprite";

        image = useBackgroundImage ? $("<div>") : $("<img>");
        
        image.css({
            position : "absolute",
            display : "block",
            top : 0,
            height : "100%",
            width : "100%",
            backgroundSize : "100%",
            backgroundRepeat : "no-repeat"
        });
        
        div.image = image[0];
        div.appendChild(div.image);
        
        sprite.div = div;
        $("#game .renderer").append(div);
    }
    
    return {
        init : init,
        draw : draw,
        clear : clear,
        loadSprite : loadSprite,
        unloadSprite : unloadSprite,
        reset : reset
    };

})();
