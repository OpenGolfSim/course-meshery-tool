import React, { Fragment, useState, useRef, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box } from '@mui/material';

function BezierSplineEditor({
  width = 400,
  height = 400,
  containerProps,
  displayRelativePoints,
  curveProps,
  indicatorProps,
  indicatorSpeed = 5,
  backgroundLineProps,
  points: propsPoints,
  ...props
}) {
  const controlPointRadius = 10;
  const padding = 0;

  const svgRef = useRef(null);
  // const circleRef = useRef(null);

  const scalePoints = (points) =>
    points.map(([x,y]) => ([
      x * width,
      (1 - y) * height,
    ])
  );

  const unScalePoint = ([x, y]) => ([
    x / width,
    y / height,
  ]);

  const [m_points, m_setPoints] = useState([
    [0,1],[0.25,1],[0.25,0],[1,0]
  ]);

  const relativePoints = propsPoints != undefined ? propsPoints : m_points;
  const setRelativePoints = props.onPointsChange ?? m_setPoints;
  const scaledPoints = scalePoints(relativePoints);

  const handleDrag = (event, index) => {
    if (!svgRef.current) return;

    event.preventDefault();

    const rect = svgRef.current.getBoundingClientRect();

    const scale = rect.width / width

    let x = (event.clientX - rect.left - padding) / scale;
    let y = (event.clientY - rect.top - padding) / scale;

    // Constrain all points within the bounding box
    x = Math.max(0, Math.min(rect.width - padding * 2, x));
    y = Math.max(0, Math.min(rect.height - padding * 2, y));

    const newPoints = [...relativePoints];
    if (index === 0 || index === relativePoints.length - 1) {
      newPoints[index] = [scaledPoints[index][0],  y];
    } else {
      newPoints[index] = [x, y];
    }

    newPoints[index] = unScalePoint(newPoints[index]);

    // flip the y axis
    newPoints[index][1] = 1 - newPoints[index][1];

    setRelativePoints(newPoints);
  };

  const handleAddPoint = (event) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    
    const scale = rect.width / width

    let x = (event.clientX - rect.left - padding) / scale;
    let y = (event.clientY - rect.top - padding) / scale;

    // Find the nearest existing anchor points
    // let nearestIndex = 0;
    let insertIndex = scaledPoints.length - 3; // Default to the second-last anchor point
    for (let i = 0; i < scaledPoints.length - 3; i += 3) {
      // console.log("comparing", x, points[i + 3].x, "at", i);
      if (x < scaledPoints[i + 3][0]) {
        insertIndex = i;
        break;
      }
    }

    let newAnchorPoint = [ x, y ];
    const controlPoint1 = unScalePoint({
      x: newAnchorPoint[0] - 20,
      y: newAnchorPoint[1],
    });
    const controlPoint2 = unScalePoint({
      x: newAnchorPoint[0] + 20,
      y: newAnchorPoint[1],
    });
    newAnchorPoint = unScalePoint(newAnchorPoint);

    // flip the y axis
    newAnchorPoint[1] = 1 - newAnchorPoint[1];
    controlPoint1[1] = 1 - controlPoint1[1];
    controlPoint2[1] = 1 - controlPoint2[1];

    const newPoints = [...relativePoints];
    newPoints.splice(
      insertIndex + 2,
      0,
      controlPoint1,
      newAnchorPoint,
      controlPoint2,
    );

    setRelativePoints(newPoints);
  };

  const handleRemovePoint = (event, index) => {
    event.stopPropagation(); // Prevent triggering the onClick event on the SVG

    if (index === 0 || index === scaledPoints.length - 1) {
      alert("Can't remove the start or end points");
      return;
    }

    // Ensure index is aligned with an anchor point
    if ((index - 3) % 3 !== 0) return;

    const newPoints = [...relativePoints];
    newPoints.splice(index - 1, 3); // Remove the anchor point and its adjacent control points

    setRelativePoints(newPoints);
  };

  const pathData = `M ${scaledPoints[0][0]} ${scaledPoints[0][1]} C ${scaledPoints
    .slice(1)
    .map(([x,y]) => `${x} ${y}`)
    .join(', ')}`;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onDoubleClick={handleAddPoint}
      style={{
        overflow: 'visible',
        padding: `${padding}px`,
        border: '1px solid var(--grey-400)'
      }}
      {...containerProps}
    >
      <path d={pathData} stroke="var(--primary)" fill="none" strokeWidth={2} {...curveProps} />

      {scaledPoints.map(([x, y], index) => {
        if (index % 3 === 1) {
          return (
            <Fragment key={index}>
              <line
                key={`${index}-1`}
                x1={scaledPoints[index - 1][0]}
                y1={scaledPoints[index - 1][1]}
                x2={x}
                y2={y}
                strokeWidth={2}
                stroke="var(--grey-300)"
                strokeDasharray="5,5"
                {...props.controlPointLineProps}
              />
              <line
                key={`${index}-2`}
                x1={scaledPoints[index + 1][0]}
                y1={scaledPoints[index + 1][1]}
                x2={scaledPoints[index + 2][0]}
                y2={scaledPoints[index + 2][1]}
                stroke="var(--grey-300)"
                strokeDasharray="5,5"
                strokeWidth={2}
                {...props.controlPointLineProps}
              />
            </Fragment>
          );
        }
        return null;
      })}

      {scaledPoints.map(([x, y], index) => (
        <Fragment key={index}>
          <circle
            key={index}
            cx={x}
            cy={y}
            r={controlPointRadius}
            style={{
              cursor: 'move',
            }}
            // fill="red"
            fill={index % 3 === 0 ? 'var(--primary)' : 'var(--grey-100)'}
            onDoubleClick={(event) => handleRemovePoint(event, index)}
            onMouseDown={(e) => {
              const listener = (event) => handleDrag(event, index);
              document.body.addEventListener('mousemove', listener);
              document.body.addEventListener('mouseup', (event) =>
                document.body.removeEventListener('mousemove', listener),
              );
            }}
            {...(index % 3 === 0
              ? props.anchorPointProps
              : props.controlPointProps)}
          />
        </Fragment>
      ))}

      <line
        x1={0}
        y1={height * 0.5}
        x2={width}
        y2={height * 0.5}
        stroke="#505050"
        {...backgroundLineProps}
      />
      <line
        x1={width * 0.5}
        y1={0}
        x2={width * 0.5}
        y2={height}
        stroke="#505050"
        {...backgroundLineProps}
      />

      {/* <circle
        ref={circleRef}
        cx="10"
        cy="10"
        r="5"
        fill="darkgray"
        {...indicatorProps}
      /> */}
    </svg>
  );
}


export default function CurveEditDialog(props) {
  const { onClose, open } = props;
  const [curveValue, setCurveValue] = useState(
    props.layer.dig?.curvePoints ||
    [[0,1],[0.5,1],[0.5,0],[1,0]]
  );
  // const [value, setValue] = useState<BezierEditorValue>([0.8, 0.2, 0.2, 0.8])
  
  const handleUpdatePoints = useCallback((points) => {
    setCurveValue(points);
  }, []);
  
  const handleSave = useCallback(() => {
    props.onClose(curveValue);
  }, [curveValue]);

  return (
    <Dialog
      onClose={onClose}
      open={open}
    >
      <DialogTitle>
        Edit Dig Curve
      </DialogTitle>
      <DialogContent>
        <Box sx={{ p: 3 }}>
          <BezierSplineEditor
            width={300}
            height={300}
            points={curveValue}
            indicatorSpeed={0}
            onPointsChange={handleUpdatePoints}
          />
        </Box>
      </DialogContent>
      <DialogActions>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={handleSave}
          >
            Save
          </Button>
      </DialogActions>
    </Dialog>
  );
 
}