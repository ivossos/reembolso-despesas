import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import {
  People,
  Receipt,
  TrendingUp,
  Settings,
  Edit,
  Block,
  CheckCircle,
  Person,
  AdminPanelSettings,
  Approval,
  AttachMoney,
  Cancel,
  Pending,
  BarChart,
  PieChart,
  Timeline,
  Refresh,
} from '@mui/icons-material';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { useSnackbar } from 'notistack';
import axios from 'axios';

const Admin = () => {
  const { enqueueSnackbar } = useSnackbar();
  
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Users Management
  const [users, setUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(0);
  const [usersRowsPerPage, setUsersRowsPerPage] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUserRole, setNewUserRole] = useState('');
  
  // Statistics
  const [stats, setStats] = useState(null);
  const [systemSettings, setSystemSettings] = useState({});
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState(null);
  const [settingValue, setSettingValue] = useState('');

  // Fetch system statistics
  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/stats');
      setStats(response.data.data);
    } catch (error) {
      enqueueSnackbar('Failed to fetch statistics', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Fetch users
  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams({
        page: usersPage + 1,
        limit: usersRowsPerPage,
      });

      const response = await axios.get(`/api/admin/users?${params}`);
      setUsers(response.data.data.users);
      setTotalUsers(response.data.data.pagination.total);
    } catch (error) {
      enqueueSnackbar('Failed to fetch users', { variant: 'error' });
    }
  };

  // Fetch system settings
  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/admin/settings');
      setSystemSettings(response.data.data.settings);
    } catch (error) {
      enqueueSnackbar('Failed to fetch settings', { variant: 'error' });
    }
  };

  useEffect(() => {
    if (currentTab === 0) {
      fetchStats();
    } else if (currentTab === 1) {
      fetchUsers();
    } else if (currentTab === 2) {
      fetchSettings();
    }
  }, [currentTab, usersPage, usersRowsPerPage]);

  // Handle user role change
  const handleUserRoleChange = async () => {
    if (!selectedUser || !newUserRole) return;

    try {
      await axios.put(`/api/admin/users/${selectedUser.id}/role`, {
        role: newUserRole,
      });

      enqueueSnackbar('User role updated successfully', { variant: 'success' });
      setUserDialogOpen(false);
      setSelectedUser(null);
      setNewUserRole('');
      fetchUsers();
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.message || 'Failed to update user role',
        { variant: 'error' }
      );
    }
  };

  // Handle user status change
  const handleUserStatusChange = async (userId, isActive) => {
    try {
      await axios.put(`/api/admin/users/${userId}/status`, {
        isActive,
      });

      enqueueSnackbar(
        `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        { variant: 'success' }
      );
      fetchUsers();
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.message || 'Failed to update user status',
        { variant: 'error' }
      );
    }
  };

  // Handle settings update
  const handleSettingsUpdate = async () => {
    if (!selectedSetting) return;

    try {
      let parsedValue;
      try {
        parsedValue = JSON.parse(settingValue);
      } catch {
        parsedValue = settingValue;
      }

      await axios.put(`/api/admin/settings/${selectedSetting}`, {
        value: parsedValue,
      });

      enqueueSnackbar('Setting updated successfully', { variant: 'success' });
      setSettingsDialogOpen(false);
      setSelectedSetting(null);
      setSettingValue('');
      fetchSettings();
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.message || 'Failed to update setting',
        { variant: 'error' }
      );
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'error';
      case 'approver':
        return 'warning';
      case 'employee':
        return 'info';
      default:
        return 'default';
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin':
        return <AdminPanelSettings fontSize="small" />;
      case 'approver':
        return <Approval fontSize="small" />;
      case 'employee':
        return <Person fontSize="small" />;
      default:
        return <Person fontSize="small" />;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  // Statistics Tab
  const StatisticsTab = () => {
    if (loading || !stats) {
      return (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      );
    }

    const categoryData = stats.categories.map(cat => ({
      name: cat.category,
      value: parseFloat(cat.total_amount),
      count: parseInt(cat.count),
    }));

    const dailyTrendData = stats.dailyTrend.map(day => ({
      date: new Date(day.date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' }),
      expenses: parseInt(day.expense_count),
      amount: parseFloat(day.total_amount),
    }));

    return (
      <Grid container spacing={3}>
        {/* Summary Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="overline">
                    Total Users
                  </Typography>
                  <Typography variant="h4" color="primary.main">
                    {stats.users.total_users}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <People />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="overline">
                    Total Expenses
                  </Typography>
                  <Typography variant="h4" color="info.main">
                    {stats.overall.total_expenses}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'info.main' }}>
                  <Receipt />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="overline">
                    Pending Approval
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    {stats.overall.pending_expenses}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'warning.main' }}>
                  <Pending />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="overline">
                    Total Amount
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {formatCurrency(stats.overall.total_amount)}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'success.main' }}>
                  <AttachMoney />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Charts */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Daily Expense Trend
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip 
                    formatter={(value, name) => [
                      name === 'amount' ? formatCurrency(value) : value,
                      name === 'amount' ? 'Amount' : 'Count'
                    ]}
                  />
                  <Line type="monotone" dataKey="expenses" stroke="#8884d8" name="expenses" />
                  <Line type="monotone" dataKey="amount" stroke="#82ca9d" name="amount" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Expenses by Category
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* User Role Breakdown */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                User Role Distribution
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Box textAlign="center" p={2}>
                    <Avatar sx={{ bgcolor: 'error.main', mx: 'auto', mb: 1 }}>
                      <AdminPanelSettings />
                    </Avatar>
                    <Typography variant="h4" color="error.main">
                      {stats.users.admins}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Administrators
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box textAlign="center" p={2}>
                    <Avatar sx={{ bgcolor: 'warning.main', mx: 'auto', mb: 1 }}>
                      <Approval />
                    </Avatar>
                    <Typography variant="h4" color="warning.main">
                      {stats.users.approvers}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Approvers
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box textAlign="center" p={2}>
                    <Avatar sx={{ bgcolor: 'info.main', mx: 'auto', mb: 1 }}>
                      <Person />
                    </Avatar>
                    <Typography variant="h4" color="info.main">
                      {stats.users.employees}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Employees
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  // Users Management Tab
  const UsersTab = () => (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="between" alignItems="center" mb={2}>
          <Typography variant="h6">User Management</Typography>
          <Button
            startIcon={<Refresh />}
            onClick={fetchUsers}
            size="small"
          >
            Refresh
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Login</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <Avatar sx={{ mr: 2 }}>
                        {user.first_name?.[0]}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle2">
                          {user.first_name} {user.last_name}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {user.email}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getRoleIcon(user.role)}
                      label={user.role}
                      size="small"
                      color={getRoleColor(user.role)}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{user.department || 'Not specified'}</TableCell>
                  <TableCell>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={user.is_active}
                          onChange={(e) => handleUserStatusChange(user.id, e.target.checked)}
                          size="small"
                        />
                      }
                      label={user.is_active ? 'Active' : 'Inactive'}
                    />
                  </TableCell>
                  <TableCell>
                    {user.last_login 
                      ? new Date(user.last_login).toLocaleDateString('pt-BR')
                      : 'Never'
                    }
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Change Role">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedUser(user);
                          setNewUserRole(user.role);
                          setUserDialogOpen(true);
                        }}
                      >
                        <Edit />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={totalUsers}
          page={usersPage}
          onPageChange={(e, newPage) => setUsersPage(newPage)}
          rowsPerPage={usersRowsPerPage}
          onRowsPerPageChange={(e) => {
            setUsersRowsPerPage(parseInt(e.target.value, 10));
            setUsersPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </CardContent>
    </Card>
  );

  // Settings Tab
  const SettingsTab = () => (
    <Grid container spacing={3}>
      {Object.entries(systemSettings).map(([key, setting]) => (
        <Grid item xs={12} key={key}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box flex={1}>
                  <Typography variant="h6" gutterBottom>
                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Typography>
                  <Typography variant="body2" color="textSecondary" paragraph>
                    {setting.description}
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(setting.value, null, 2)}
                    </Typography>
                  </Paper>
                  {setting.updated_at && (
                    <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                      Last updated: {new Date(setting.updated_at).toLocaleString('pt-BR')}
                    </Typography>
                  )}
                </Box>
                <Button
                  startIcon={<Edit />}
                  onClick={() => {
                    setSelectedSetting(key);
                    setSettingValue(JSON.stringify(setting.value, null, 2));
                    setSettingsDialogOpen(true);
                  }}
                  size="small"
                >
                  Edit
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Admin Panel
        </Typography>
        <Typography variant="body1" color="textSecondary">
          System administration and management tools
        </Typography>
      </Box>

      <Card sx={{ mb: 3 }}>
        <Tabs
          value={currentTab}
          onChange={(e, newValue) => setCurrentTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab icon={<BarChart />} label="Statistics" />
          <Tab icon={<People />} label="Users" />
          <Tab icon={<Settings />} label="Settings" />
        </Tabs>
      </Card>

      {currentTab === 0 && <StatisticsTab />}
      {currentTab === 1 && <UsersTab />}
      {currentTab === 2 && <SettingsTab />}

      {/* User Role Dialog */}
      <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Change User Role</DialogTitle>
        <DialogContent>
          {selectedUser && (
            <Box mb={2}>
              <Typography variant="subtitle1">
                {selectedUser.first_name} {selectedUser.last_name}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {selectedUser.email}
              </Typography>
            </Box>
          )}
          
          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select
              value={newUserRole}
              label="Role"
              onChange={(e) => setNewUserRole(e.target.value)}
            >
              <MenuItem value="employee">Employee</MenuItem>
              <MenuItem value="approver">Approver</MenuItem>
              <MenuItem value="admin">Administrator</MenuItem>
            </Select>
          </FormControl>

          <Alert severity="warning" sx={{ mt: 2 }}>
            Changing user roles will immediately affect their access permissions.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUserRoleChange} variant="contained">
            Update Role
          </Button>
        </DialogActions>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit System Setting</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle1" gutterBottom>
            {selectedSetting?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Typography>
          
          <TextField
            fullWidth
            multiline
            rows={10}
            label="Setting Value (JSON)"
            value={settingValue}
            onChange={(e) => setSettingValue(e.target.value)}
            sx={{ mt: 2 }}
            helperText="Enter valid JSON format"
          />

          <Alert severity="info" sx={{ mt: 2 }}>
            Please ensure the JSON format is valid. Invalid JSON will cause errors.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSettingsUpdate} variant="contained">
            Update Setting
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Admin;