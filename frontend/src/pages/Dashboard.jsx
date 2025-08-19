import React from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Paper,
  Avatar,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
} from '@mui/material';
import {
  TrendingUp,
  Receipt,
  CheckCircle,
  Cancel,
  Pending,
  Add,
  AttachMoney,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Mock data - in real app, this would come from API
  const stats = {
    totalExpenses: 12,
    pendingExpenses: 3,
    approvedExpenses: 7,
    rejectedExpenses: 2,
    totalAmount: 2450.75,
    pendingAmount: 650.00,
  };

  const recentExpenses = [
    {
      id: 1,
      title: 'Team Lunch Meeting',
      amount: 85.50,
      date: '2024-01-15',
      status: 'approved',
      category: 'meals',
    },
    {
      id: 2,
      title: 'Adobe Creative Suite',
      amount: 320.00,
      date: '2024-01-20',
      status: 'pending',
      category: 'software',
    },
    {
      id: 3,
      title: 'Uber to Client Office',
      amount: 25.00,
      date: '2024-01-16',
      status: 'reimbursed',
      category: 'transportation',
    },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending':
        return 'warning';
      case 'rejected':
        return 'error';
      case 'reimbursed':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircle />;
      case 'pending':
        return <Pending />;
      case 'rejected':
        return <Cancel />;
      case 'reimbursed':
        return <AttachMoney />;
      default:
        return <Receipt />;
    }
  };

  const StatCard = ({ title, value, icon, color = 'primary', subtitle }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography color="textSecondary" gutterBottom variant="overline">
              {title}
            </Typography>
            <Typography variant="h4" component="div" color={`${color}.main`}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Avatar sx={{ bgcolor: `${color}.main`, width: 56, height: 56 }}>
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Welcome back, {user?.first_name}!
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Here's an overview of your expense activity
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Expenses"
            value={stats.totalExpenses}
            icon={<Receipt />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Pending"
            value={stats.pendingExpenses}
            icon={<Pending />}
            color="warning"
            subtitle={`R$ ${stats.pendingAmount.toFixed(2)}`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Approved"
            value={stats.approvedExpenses}
            icon={<CheckCircle />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Amount"
            value={`R$ ${stats.totalAmount.toFixed(2)}`}
            icon={<TrendingUp />}
            color="info"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Quick Actions */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  fullWidth
                  onClick={() => navigate('/expenses/new')}
                >
                  Submit New Expense
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Receipt />}
                  fullWidth
                  onClick={() => navigate('/expenses')}
                >
                  View All Expenses
                </Button>
                {['approver', 'admin'].includes(user?.role) && (
                  <Button
                    variant="outlined"
                    startIcon={<Pending />}
                    fullWidth
                    onClick={() => navigate('/approvals')}
                  >
                    Pending Approvals
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Expenses */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  Recent Expenses
                </Typography>
                <Button
                  size="small"
                  onClick={() => navigate('/expenses')}
                >
                  View All
                </Button>
              </Box>
              <List>
                {recentExpenses.map((expense, index) => (
                  <React.Fragment key={expense.id}>
                    <ListItem
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/expenses/${expense.id}`)}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: `${getStatusColor(expense.status)}.main` }}>
                          {getStatusIcon(expense.status)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={expense.title}
                        secondary={
                          <Box display="flex" alignItems="center" gap={1} mt={1}>
                            <Typography variant="body2" color="textSecondary">
                              {new Date(expense.date).toLocaleDateString()}
                            </Typography>
                            <Chip
                              label={expense.status}
                              size="small"
                              color={getStatusColor(expense.status)}
                              variant="outlined"
                            />
                            <Chip
                              label={expense.category}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        }
                      />
                      <Typography variant="h6" color="primary">
                        R$ {expense.amount.toFixed(2)}
                      </Typography>
                    </ListItem>
                    {index < recentExpenses.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
