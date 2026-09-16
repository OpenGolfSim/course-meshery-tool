import React, { useState } from 'react';
import { Box, Button, Collapse, List, ListSubheader } from '@mui/material';
import CustomListItem from '../components/CustomListItem.jsx';
import DeleteIcon from '@mui/icons-material/Delete';
import ObjectIcon from '@mui/icons-material/ViewInAr';


export default function ObjectList(props) {
  const { objects, selectedObject, onSelect, onRemove } = props;
  return (
    <List disablePadding={true}>
      {objects?.map(obj => (
        <CustomListItem
          button={{
            onClick: () => onSelect(obj)
          }}
          selected={selectedObject === obj.id}
          icon={<ObjectIcon />}
          label={obj.name}
          menuItems={[
            {
              label: 'Remove Model',
              icon: <DeleteIcon />,
              onClick: () => onRemove?.(obj.id)
            }
          ]}          
        />
      ))}
    </List>
  )
}