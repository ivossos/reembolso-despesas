import React from 'react';
import { Typography, Container, Paper, Box } from '@mui/material';

const ExpenseDetail = () => {
  return (
    <Container>
      <Box mt={2}>
        <Typography variant="h4" gutterBottom>
          Expense Details
        </Typography>
        <Paper sx={{ p: 4 }}>
          <Typography>
            Expense detail functionality coming soon...
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default ExpenseDetail;
