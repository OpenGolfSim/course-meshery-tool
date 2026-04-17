import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import gsap from "gsap";
import MotionPathPlugin from "gsap/MotionPathPlugin";
import MotionPathHelper from "gsap/MotionPathHelper";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, MotionPathPlugin);

const SVGPath = forwardRef((props, ref) => {
  const { zoomLevel, layer, ...rest } = props;
  const pathRef = useRef();
  const pathEditor = useRef();
  
  const dAttribute = useMemo(() => {
    if (!layer) {
      return '';
    }
    const { isClosed, points } = layer;
    if (points.length === 0) return '';
    console.log('points', points);
    // Start the path
    // Start the path using indices [0] for x and [1] for y
    let d = `M ${points[0][0]},${points[0][1]}`;

    if (points.length > 1) {
        const segments = isClosed ? points.length : points.length - 1;

        for (let i = 0; i < segments; i++) {
            const len = points.length;
            
            const i0 = (i - 1 + len) % len;
            const i1 = i % len;
            const i2 = (i + 1) % len;
            const i3 = (i + 2) % len;

            let p0 = points[i0];
            let p1 = points[i1];
            let p2 = points[i2];
            let p3 = points[i3];

            if (!isClosed) {
                if (i === 0) p0 = p1; 
                if (i === segments - 1) p3 = p2; 
            }

            // Calculate the smooth control points using [0] and [1]
            const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
            const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
            const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
            const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

            // Append the curve command
            d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
        }
    }

    if (isClosed) d += ' Z';    
    // let d = `M ${points[0][0]},${points[0][1]}`;

    // if (points.length > 1) {
    //     // Logic for smooth curves
    //   for (let i = 0; i < points.length - 1; i++) {
    //     const p0 = points[i - 1] || points[i];
    //     const p1 = points[i];
    //     const p2 = points[i + 1];
    //     const p3 = points[i + 2] || p2;

    //     // Simple smoothing: use midpoints as control points
    //     const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    //     const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    //     const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    //     const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    //     d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    //   }
    // }

    // if (isClosed) d += ' Z';
    return d;
  }, [layer]);

  const setupPathEditor = () => {
    pathEditor.current = MotionPathHelper.editPath(pathRef.current, {
      selected: false,
      draggable: true,
      handleSize: 5,
      onPress: () => console.log("pressed"),
      onRelease: (event) => {
        console.log("released!", event)
        // get the new path data
        // console.log(this.path.getAttribute('d'))
      },
      onUpdate: () => console.log("updated"),
      onDeleteAnchor: () => console.log("deleted anchor")
    });
  }
  const handlePathClick = (event) => {
    console.log('handlePathClick', event);
    if (pathEditor.current) {
      pathEditor.current.select();
    }
  }
  useGSAP(() => {
    
    setupPathEditor();
    // console.log('props.mapRef', props.mapRef);
    // props.mapRef.current.on('zoomend', () => {
    //   if (pathEditor.current) {
    //     pathEditor.current.invalidate();
    //     pathEditor.current.play();
    //   }
    // });

  }, { scope: ref });

  useEffect(() => {
    console.log('zoom level changed', zoomLevel);
    if (pathEditor.current) {
      const shouldReselect = pathEditor.current.isSelected();
      
      pathEditor.current.kill();
      setupPathEditor();
      
      if (shouldReselect) {
        pathEditor.current.select();
      }

      // pathEditor.current.update(true);
      // pathEditor.current.invalidate();
      // pathEditor.current.play();
    }
  }, [zoomLevel]);

  return (
    <path onClick={handlePathClick} ref={pathRef} d={dAttribute} {...rest}></path>
  );
});

const SVGEditor = forwardRef((props, ref) => {
  const { viewBox, layers, zoomLevel, style } = props;
  // const { contextSafe } = useGSAP(() => {
  //     // gsap code here...
  //     console.log('GSAP ready!');
  // }, { scope: ref });
  // console.log('props.mapRef', props.mapRef);

  return (
    <div style={{ position: 'absolute' }}>
      <svg id="course" ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={viewBox || '0 0 500 500'}>
        {layers?.map(layer => {
          return (
            <SVGPath
              key={layer.id}
              zoomLevel={zoomLevel}
              layer={layer}
            />
          );
        })}
        {/* <SVGPath d="m 69.944361,94.427668 c 1.057235,-10.405422 5.619936,-17.19383 14.300554,-19.753499 8.680618,-2.559669 21.478195,-0.890419 31.271715,4.89666 9.79352,5.787079 16.58194,15.691491 18.86331,25.095401 2.28138,9.4039 0.0557,18.30674 -1.94752,31.60581 -2.0032,13.29906 -3.78374,30.9931 -13.02081,43.51322 -9.23707,12.52013 -25.929894,19.86498 -41.065165,19.30845 -15.135271,-0.55652 -28.712105,-9.01422 -34.332113,-19.25281 -5.620008,-10.2386 -3.283059,-22.2572 3.004825,-30.38136 6.287884,-8.12417 16.525945,-12.35294 20.421095,-21.47872 3.89515,-9.12578 1.446873,-23.14773 2.504109,-33.553152 z" /> */}

      </svg>
    </div>
  )
});

export default SVGEditor;
