import React, { useState } from 'react';
import { Box, Button, Collapse, List, ListSubheader } from '@mui/material';
import CustomListItem from '../components/CustomListItem.jsx';
import ImportIcon from '@mui/icons-material/FileOpen';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LayerIcon from '@mui/icons-material/Layers';
import TreeIcon from '@mui/icons-material/Park';
import NumberField from './NumberField.jsx';
import { useProject } from '../contexts/Project.jsx';

export default function TreeLayerList({
  trees,
  selectedTree,
  onEdit,
  onRemove,
  onTreeSelect,
  onImportModel,
  onRemoveModel
}) {
  const { updateTree } = useProject();
  const [panelOpen, setPanelOpen] = useState(null);

  const togglePanel = (panelId) => {
    console.log(panelId);
    setPanelOpen(old => old === panelId ? null : panelId)
  }
  return (
    <List disablePadding={true}>
      {trees?.map(treeLayer => (
        <React.Fragment key={treeLayer.id}>
          <CustomListItem
            button={{
              onClick: () => togglePanel(treeLayer.id)
            }}
            disableGutters={true}
        
            label={treeLayer.name}
            icon={<LayerIcon />}
            menuItems={[
              // {
              //   label: 'Plant',
              //   icon: <ImportIcon />,
              //   onClick: () => onImportModel(treeLayer.id)
              // },
              {
                label: 'Edit Layer',
                icon: <EditIcon />,
                onClick: () => onEdit(treeLayer)
              },
              {
                label: 'Remove Layer',
                icon: <DeleteIcon />,
                onClick: () => onRemove(treeLayer)
              },
            ]}
          />
          <Collapse in={panelOpen === treeLayer.id} sx={{ backgroundColor: '#000' }}>
            <List disablePadding={true}>
              {
                treeLayer.treeConfigs?.map(treeConfig => (
                  <CustomListItem
                    button={{
                      onClick: () => onTreeSelect(treeLayer, treeConfig)
                    }}
                    size="small"
                    selected={selectedTree === treeConfig.id}
                    // sx={{ p: 1, pl: 3 }}
                    disablePadding={true}
                    disableGutters={false}
                    key={treeConfig.id}
                    label={treeConfig.name || treeConfig.filePath.split(/[\/\\]/g).pop()}
                    icon={<TreeIcon />}
                    menuItems={[
                      {
                        label: 'Remove Model',
                        icon: <DeleteIcon />,
                        onClick: () => onRemoveModel(treeLayer.id, treeConfig.id)
                      }
                    ]}
                  />
                ))
              }
            </List>
          
            <Box sx={{ textAlign: 'center', pt: 3, pb: 4 }}>
              <Button onClick={() => onImportModel(treeLayer.id)} size="small" variant="contained" color="secondary">Plant Object</Button>
            </Box>
          </Collapse>
        </React.Fragment>
      ))}
    </List>
  )
}