import React from 'react';
import { Typography, Container, Paper, Box } from '@mui/material';

const Settings = () => {
  return (
    <Container>
      <Box mt={2}>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>
        <Paper sx={{ p: 4 }}>
          <Typography>
            Settings functionality coming soon...
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default Settings;
