import React from 'react';
import { Typography, Container, Paper, Box } from '@mui/material';

const VerifyEmail = () => {
  return (
    <Container maxWidth="sm">
      <Box mt={8}>
        <Paper sx={{ p: 4 }}>
          <Typography variant="h4" gutterBottom>
            Verify Email
          </Typography>
          <Typography>
            Email verification functionality coming soon...
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default VerifyEmail;
