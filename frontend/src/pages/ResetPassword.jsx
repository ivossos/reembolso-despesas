import React from 'react';
import { Typography, Container, Paper, Box } from '@mui/material';

const ResetPassword = () => {
  return (
    <Container maxWidth="sm">
      <Box mt={8}>
        <Paper sx={{ p: 4 }}>
          <Typography variant="h4" gutterBottom>
            Reset Password
          </Typography>
          <Typography>
            Password reset functionality coming soon...
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default ResetPassword;
